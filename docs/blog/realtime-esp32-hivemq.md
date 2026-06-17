# How DeskNote Got Real-Time: HiveMQ Cloud, Supabase, and a $12 ESP32

*Part 2 of the DeskNote story. In [Why I built DeskNote](https://anikap.tech/blog/why-i-built-desknote) I wrote about the why — a message deserving physical presence instead of disappearing into a feed. This is the how.*

---

A note on a desk should feel instant. You hit send, and somewhere across the city a little screen lights up.

The first version of DeskNote didn't work like that. It *polled*. The ESP32 behind the display asked my server "anything new?" over and over — thousands of HTTP requests a day to deliver maybe five messages. It worked. But a device whose whole purpose is intentional presence was, under the hood, anxiously refreshing an inbox forever. That felt wrong.

So I rebuilt delivery as **pure push** with MQTT and HiveMQ Cloud. A message now travels phone → database → desk in **0.3–1 second**, with *zero* requests while idle. The desk just listens.

This post is the architecture, plus the four very real walls I hit on the way — including a bug that only existed when you pulled the plug. (Quick context if you're new here: DeskNote is a pair of desk displays for me and my partner, built on the "Cheap Yellow Display" — an ESP32 with a 2.8" touchscreen that costs about as much as lunch — with Supabase as the backend.)

## The architecture

```
Mobile app ──INSERT──▶ Supabase `messages` table
                          │  Database Webhook (fires on INSERT)
                          ▼
              Supabase Edge Function (Deno)
                          │  publishes via MQTT-over-WebSocket
                          ▼
                  HiveMQ Cloud broker
                          │  topic: esp32/display/<device-id>
                          │  pushed over TLS :8883
                          ▼
                ESP32, already subscribed ──▶ screen
```

The key idea: the ESP32 opens **one long-lived TLS connection** to HiveMQ Cloud at boot and subscribes to its own topic. From then on it does nothing but listen. When a row lands in Postgres, a webhook fires an Edge Function, the function publishes to the broker, and the broker pushes the message down the already-open socket. Nobody polls anybody.

HiveMQ Cloud's free Serverless tier is genuinely generous for this: 100 concurrent connections, 10 GB of traffic a month, TLS on port 8883, and a built-in web client that's perfect for debugging. Two desks and one Edge Function barely scratch it.

Each desk subscribes to `esp32/display/<its-own-device-uuid>`, and the Edge Function publishes to the topic matching the message's recipient. That one design choice gives you per-device routing for free — my desk never sees my partner's messages, and adding a third desk requires no new infrastructure at all.

## Wall #1: the free tier has no REST API

My original plan was for the Edge Function to publish with a simple HTTP call. Turns out **HiveMQ Cloud's free tier doesn't expose a REST publish API** — that lives in the enterprise self-hosted product.

The fix was to make the Edge Function a real (if short-lived) MQTT client. Deno's npm compatibility saved me here — the `mqtt` package works inside a Supabase Edge Function over secure WebSocket (port 8884):

```ts
import mqtt from "npm:mqtt@5";

const client = mqtt.connect(`wss://${HIVEMQ_HOST}:8884/mqtt`, {
  username: HIVEMQ_USER,
  password: HIVEMQ_PASS,
  clean: true,
});
// connect → publish (QoS 1, wait for the ack) → disconnect
```

Connect, publish one message at QoS 1, wait for the broker's acknowledgment, disconnect. The whole lifetime is under a second.

## Wall #2: `EarlyDrop` — when your webhook hangs up on you

My first end-to-end test worked. Then real inserts started failing with a cryptic log entry:

```json
{ "event_type": "Shutdown", "reason": "EarlyDrop" }
```

`EarlyDrop` means the *caller* dropped the connection before the function finished. Supabase's database webhooks are built on Postgres's `pg_net`, which has a timeout — and a cold-started Deno function importing an npm MQTT library plus a TLS handshake can exceed it. The webhook gave up, and the runtime killed my function **mid-publish**.

The fix is one line of platform API: respond to the webhook immediately and finish the publish in the background.

```ts
EdgeRuntime.waitUntil(publishToHiveMQ(topic, payload));
return new Response(JSON.stringify({ ok: true }), { status: 200 });
```

`waitUntil` keeps the worker alive until the promise settles, even though the HTTP response is long gone. No more EarlyDrop.

## Wall #3: the webhook header that silently wasn't

After deploying, messages *still* weren't arriving — but my manual `curl` tests worked perfectly. The function logs showed it rejecting every real webhook call with 401.

I queried the actual trigger definition in Postgres and found this in the webhook's headers:

```json
{ "name": "x-webhook-secret, value: 45a2..." }
```

When creating the webhook in the dashboard, the header **name** and **value** had been pasted into one field. So instead of sending `x-webhook-secret: 45a2...`, Postgres was sending a header literally called `name`. My function never saw the secret and correctly rejected everything.

The lesson that stuck with me: **don't debug configuration through the UI that created it.** Query the source of truth. One SQL statement recreated the trigger with a properly formed header, and the pipeline lit up.

## Wall #4: the zombie message

The best bug of the day. Everything worked — until I power-cycled the desk, and it greeted me with a message from *hours earlier*.

The system keeps a delivery queue: every message becomes a "note" row, and the desk marks each note **seen** after displaying it. During development I'd run a throwaway firmware build that displayed messages but never marked anything seen. Those notes stayed `queued` forever — invisible zombies, because live MQTT delivery kept showing newer messages on top.

Until reboot. On boot, the firmware asks the server for the newest *queued* note as a catch-up mechanism. The newest queued note was a stale `"test"` from the zombie era. The desk faithfully resurrected it.

The fix was a small change with a nice property: when the desk marks a note seen, the server now also retires **every older note still queued for that recipient**. Acknowledging a newer message means anything older is stale by definition. It's self-healing too — even if one "seen" call fails on flaky WiFi, the next one cleans up after it.

## The firmware side

On the ESP32, the MQTT client is ~40 lines on top of `PubSubClient` + `WiFiClientSecure`, with the Let's Encrypt root CA pinned for TLS:

```cpp
WiFiClientSecure tls;
PubSubClient mqtt(tls);

tls.setCACert(ISRG_ROOT_X1);
mqtt.setServer(MQTT_HOST, 8883);
mqtt.setCallback(onMessage);   // fires the render pipeline
mqtt.connect(clientId, user, pass);
mqtt.subscribe(deviceTopic, /*qos=*/1);
```

A few production details that mattered more than the happy path:

- **Nothing per-device is compiled in.** The device registers itself with my API on first boot and stores its UUID + token in flash (NVS). WiFi comes from an on-screen setup flow — scan, tap your network, type the password on a touch QWERTY. One identical binary for every desk I'll ever build.
- **The reconnect loop is the product.** WiFi drops, brokers restart, routers reboot. Every loop pass pumps the socket and retries with a backoff if disconnected. The happy path took an hour; the reconnect behavior is what makes it an appliance instead of a demo.
- **HTTP didn't disappear — it changed jobs.** The desk still calls my REST API: once at boot to restore the last message and theme, and as a 6-hourly safety net for anything missed while powered off. MQTT is the delivery path; HTTP is state sync. The request count went from thousands per day to a handful.
- **A stable MQTT client ID per device** means a reconnecting desk cleanly replaces its own old session instead of fighting it — and two desks can never kick each other off the broker.

## Latency, measured end to end

| Hop | Time |
|---|---|
| App insert → webhook fires | ~10–50 ms |
| Edge Function (warm) connect + publish | ~200–800 ms |
| Broker → ESP32 → pixels on screen | ~10–50 ms |

Tap *send* on a phone; the desk across the city is animating the message before you've put the phone down. With idle traffic of exactly zero.

## What I'd tell past-me

1. **Check the pricing page for the API you're designing around.** The "publish via REST" plan died on a feature-matrix footnote. The MQTT-over-WebSocket workaround ended up cleaner anyway.
2. **Serverless + persistent protocols need `waitUntil`.** Anything socket-shaped inside a request-scoped function wants to outlive the response.
3. **When config "looks right" in a UI, read it back from the database.** The malformed-header bug was invisible in the dashboard and obvious in `pg_trigger`.
4. **Test the reboot.** Every stateful bug I found today — the zombie note, the boot-restore path — only existed across a power cycle. Pulling the plug is a test case.
5. **Queue semantics deserve as much design as the happy path.** "Who marks what as seen, and when" turned out to be the actual hard problem in a system whose pitch is "text appears on screen."

The whole thing — broker, database, functions, hosting — runs on free tiers, and the hardware is a $12 board. The constraint set is real, but so is the result: a genuinely real-time, event-driven IoT pipeline with nothing pretending to be push.

In part one I wrote that I wanted communication that feels intentional. It turns out the infrastructure has to feel that way too. A device that polls is checking its phone at dinner; a device that listens is present. Same screen, same message — different posture.

Now the desk just sits there, quietly connected, until someone thinks of someone.

*The desk also does one-time "secret notes" now (they arrive hidden — tap to reveal, tap again and they're gone forever) and animated pixel-art stickers. Those are their own posts.*
