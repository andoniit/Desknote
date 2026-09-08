// DeskNote — push-notify Edge Function
//
// Triggered by a Supabase Database Webhook on INSERT into public.messages,
// alongside `mqtt-publish`: that one lights up the desk, this one taps the
// phone of the person the note was addressed to.
//
// The push never carries the note. It says a message is on your desk and
// who left it — the words stay behind row level security, which also means
// a secret one-time note keeps its secret on the lock screen.
//
// `messages` is the trigger rather than `notes` because the app inserts the
// note first and the message second, deleting the notes again if that
// second insert fails. A push on the note insert could therefore announce a
// message that was rolled back a moment later.
//
// Secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   APNS_KEY_ID       the 10-character Key ID of the .p8 auth key
//   APNS_TEAM_ID      your Apple Developer team id (VG2N3XUNXB for DeskNote)
//   APNS_PRIVATE_KEY  the whole .p8 file, BEGIN/END lines included
//   APNS_BUNDLE_ID    space.desknote.app  (the app, not the extensions)
//   WEBHOOK_SECRET    the shared secret the webhook sends as x-webhook-secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.
//
// Deploy with JWT verification off — the webhook authenticates with the
// header instead:  supabase functions deploy push-notify --no-verify-jwt

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "space.desknote.app";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const APNS_HOST = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

type Environment = keyof typeof APNS_HOST;

/// The category the app registers and the notification content extension
/// claims — without it the phone shows a plain banner instead of the
/// paper-note card.
const CATEGORY = "DESK_NOTE";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

interface PushToken {
  token: string;
  environment: Environment;
}

// MARK: - Supabase REST (service role: RLS does not apply)

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? (undefined as T) : await response.json();
}

// MARK: - APNs provider token
//
// An ES256 JWT signed with the .p8 key. Apple accepts one for an hour and
// refuses a device that refreshes faster than every 20 minutes, so the
// token is minted once per worker and reused until it is nearly stale.

let cachedJWT: { value: string; mintedAt: number } | null = null;

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string"
    ? bytes
    : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function providerToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJWT && now - cachedJWT.mintedAt < 45 * 60) return cachedJWT.value;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(APNS_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64url(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const claims = base64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  // WebCrypto signs ECDSA as raw r‖s, which is exactly the JWS ES256 shape.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  const value = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
  cachedJWT = { value, mintedAt: now };
  return value;
}

// MARK: - The notification itself

interface NoteContext {
  senderName: string | null;
  deskName: string | null;
  deviceID: string;
  noteID: string | null;
  sentAt: string;
}

function alertBody(senderName: string | null): string {
  return senderName
    ? `${senderName} left it there for you 💌`
    : "Someone left it there for you 💌";
}

function payloadFor(context: NoteContext) {
  return {
    aps: {
      alert: {
        title: "You have a message on your desk",
        body: alertBody(context.senderName),
      },
      sound: "default",
      category: CATEGORY,
      // One conversation per desk, so a flurry of notes stacks rather
      // than filling the lock screen.
      "thread-id": `desk-${context.deviceID}`,
      "interruption-level": "active",
    },
    // Read by the notification content extension to draw the card, and by
    // the app to land on the right desk when the note is tapped.
    sender_name: context.senderName,
    desk_name: context.deskName,
    device_id: context.deviceID,
    note_id: context.noteID,
    sent_at: context.sentAt,
  };
}

async function deliver(tokens: PushToken[], context: NoteContext) {
  const jwt = await providerToken();
  const body = JSON.stringify(payloadFor(context));
  const dead: string[] = [];

  await Promise.all(tokens.map(async ({ token, environment }) => {
    const host = APNS_HOST[environment] ?? APNS_HOST.production;
    try {
      const response = await fetch(`${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": APNS_BUNDLE_ID,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body,
      });

      if (response.ok) return;

      const text = await response.text();
      const reason = (() => {
        try {
          return String(JSON.parse(text).reason ?? "");
        } catch {
          return "";
        }
      })();

      // The phone deleted the app, or the token never belonged to this
      // host. Either way it will never take a push again.
      if (
        response.status === 410 ||
        reason === "BadDeviceToken" ||
        reason === "Unregistered"
      ) {
        dead.push(token);
        return;
      }
      console.error(`APNs ${response.status} ${reason || text} for …${token.slice(-8)}`);
    } catch (error) {
      console.error(`APNs request failed for …${token.slice(-8)}:`, error);
    }
  }));

  if (dead.length > 0) {
    const list = dead.map((t) => `"${t}"`).join(",");
    await rest(`push_tokens?token=in.(${list})`, { method: "DELETE" })
      .catch((error) => console.error("could not prune dead tokens:", error));
    console.log(`Pruned ${dead.length} dead token(s)`);
  }
}

// MARK: - Webhook

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.error("Missing APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY secrets");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const record = payload.record;
  if (payload.type !== "INSERT" || !record) {
    return new Response(JSON.stringify({ skipped: "not an INSERT" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const deviceID = typeof record.to_device_id === "string" ? record.to_device_id : "";
  const senderID = typeof record.from_user_id === "string" ? record.from_user_id : "";
  if (!deviceID || !senderID) {
    return new Response("record has no to_device_id / from_user_id", { status: 400 });
  }

  const skip = (reason: string) =>
    new Response(JSON.stringify({ skipped: reason }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const desks = await rest<{ owner_id: string | null; name: string | null }[]>(
      `devices?id=eq.${deviceID}&select=owner_id,name`,
    );
    const desk = desks[0];
    if (!desk?.owner_id) return skip("desk has no owner");

    // Sending to your own desk is a note to self; the phone in your hand
    // does not need to be told about it.
    if (desk.owner_id === senderID) return skip("sender owns the desk");

    const [tokens, senders] = await Promise.all([
      rest<PushToken[]>(
        `push_tokens?user_id=eq.${desk.owner_id}&select=token,environment`,
      ),
      rest<{ display_name: string | null }[]>(
        `profiles?id=eq.${senderID}&select=display_name`,
      ),
    ]);

    if (tokens.length === 0) return skip("recipient has no registered phone");

    const context: NoteContext = {
      senderName: senders[0]?.display_name?.trim() || null,
      deskName: desk.name?.trim() || null,
      deviceID,
      noteID: typeof record.note_id === "string" ? record.note_id : null,
      sentAt: typeof record.created_at === "string"
        ? record.created_at
        : new Date().toISOString(),
    };

    // Answer the webhook straight away — its timeout is short, and an
    // EarlyDrop mid-flight would kill the deliveries.
    const task = deliver(tokens, context)
      .then(() => console.log(`Pushed to ${tokens.length} device(s) for desk ${deviceID}`))
      .catch((error) => console.error("push delivery failed:", error));

    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(task);
    } else {
      await task;
    }

    return new Response(JSON.stringify({ ok: true, devices: tokens.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("push-notify failed:", error);
    return new Response("Lookup failed", { status: 500 });
  }
});
