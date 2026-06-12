// DeskNote — mqtt-publish Edge Function
//
// Triggered by a Supabase Database Webhook on INSERT into public.messages.
// Publishes the new message text to HiveMQ Cloud on topic "esp32/display"
// (QoS 1) so a subscribed ESP32 renders it instantly — no polling anywhere.
//
// NOTE: HiveMQ Cloud's free (Serverless) tier has no HTTP/REST publish API,
// so this function publishes over MQTT-over-WebSocket (port 8884, TLS) using
// the `mqtt` npm package with the same username/password credentials.
//
// Secrets (set via `supabase secrets set` or Dashboard → Edge Functions → Secrets):
//   HIVEMQ_HOST     e.g. abcdef1234567890.s1.eu.hivemq.cloud  (no scheme, no port)
//   HIVEMQ_USER     HiveMQ Cloud access credential username
//   HIVEMQ_PASS     HiveMQ Cloud access credential password
//   WEBHOOK_SECRET  shared secret the webhook sends in the x-webhook-secret header
//
// Deploy with JWT verification off (the webhook authenticates via the secret
// header instead):  supabase functions deploy mqtt-publish --no-verify-jwt

import mqtt from "npm:mqtt@5";

const HIVEMQ_HOST = Deno.env.get("HIVEMQ_HOST") ?? "";
const HIVEMQ_USER = Deno.env.get("HIVEMQ_USER") ?? "";
const HIVEMQ_PASS = Deno.env.get("HIVEMQ_PASS") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

// Each desk subscribes to its own subtopic: esp32/display/<device-uuid>.
const MQTT_TOPIC_PREFIX = "esp32/display";

// Supabase edge runtime API: keeps the worker alive until the promise
// settles, even if the caller (pg_net webhook) drops the connection early.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

function publishToHiveMQ(topic: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`wss://${HIVEMQ_HOST}:8884/mqtt`, {
      username: HIVEMQ_USER,
      password: HIVEMQ_PASS,
      clientId: `supabase-fn-${crypto.randomUUID().slice(0, 8)}`,
      protocolVersion: 4, // MQTT 3.1.1
      connectTimeout: 8_000,
      reconnectPeriod: 0, // one-shot publish: never auto-reconnect
      clean: true,
    });

    const fail = (err: Error) => {
      client.end(true);
      reject(err);
    };

    client.on("error", fail);

    client.on("connect", () => {
      client.publish(topic, message, { qos: 1 }, (err) => {
        if (err) return fail(err);
        client.end(false, {}, () => resolve());
      });
    });
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!HIVEMQ_HOST || !HIVEMQ_USER || !HIVEMQ_PASS) {
    console.error("Missing HIVEMQ_HOST / HIVEMQ_USER / HIVEMQ_PASS secrets");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (payload.type !== "INSERT" || !payload.record) {
    return new Response(JSON.stringify({ skipped: true, reason: "not an INSERT" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The DeskNote `messages` table stores text in `content`; fall back to
  // `message` so the function also works against a table using that name.
  const text = payload.record.content ?? payload.record.message;
  if (typeof text !== "string" || text.length === 0) {
    return new Response("record has no message text", { status: 400 });
  }

  // Route to the target desk only; without a device id, fall back to the
  // shared base topic.
  const deviceId = payload.record.to_device_id;
  const topic = typeof deviceId === "string" && deviceId.length > 0
    ? `${MQTT_TOPIC_PREFIX}/${deviceId}`
    : MQTT_TOPIC_PREFIX;

  // JSON payload mirrors what GET /api/device/latest returns, so the firmware
  // renders quick-sends correctly and can POST /api/device/seen with the
  // note's queue id. `id` is the `notes` row (the queue), not the message row.
  const mqttPayload = JSON.stringify({
    id: payload.record.note_id ?? payload.record.id ?? "",
    body: text,
    message_type: payload.record.message_type ?? "standard",
  });

  const publishTask = publishToHiveMQ(topic, mqttPayload)
    .then(() => console.log(`Published ${text.length} chars to ${topic}`))
    .catch((err) => console.error(`MQTT publish to ${topic} failed:`, err));

  // Respond immediately so the webhook's short timeout can't EarlyDrop the
  // worker mid-publish; the publish finishes in the background.
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(publishTask);
  } else {
    await publishTask; // local dev fallback
  }

  return new Response(JSON.stringify({ ok: true, topic }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
