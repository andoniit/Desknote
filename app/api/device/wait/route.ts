import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";

/**
 * GET /api/device/wait?deviceId=<uuid> — long-poll for the next queued note.
 *
 * Why: a 2–3 s poll loop from every desk would churn Supabase. Instead the
 * device holds a single long-lived GET here; we resolve it the moment a
 * matching INSERT on public.notes comes through Supabase Realtime, or after
 * ~25 s (so intermediaries don't idle-reap the connection).
 *
 * Response shapes mirror /api/device/latest so firmware can swap endpoints
 * without changing its parser:
 *   - {"message":null,"reason":"unpaired"}           — desk not claimed yet.
 *   - {"message":{"id","body","created_at","status"}} — a new queued note.
 *   - {"message":null}                                — no note in the window.
 *
 * Requires:
 *   - supabase/migrations/20260420010000_notes_realtime.sql applied, so
 *     `public.notes` is in the `supabase_realtime` publication.
 *   - SUPABASE_SERVICE_ROLE_KEY in env so the service client can subscribe
 *     across RLS.
 */

// Max duration hint for Vercel's Node runtime. Hobby caps serverless at 10 s;
// Pro allows up to 60 s (with maxDuration). Default wait stays under 10 s so
// long-polls complete on Hobby; override with DEVICE_WAIT_TIMEOUT_MS (ms).
export const maxDuration = 30;

const WAIT_TIMEOUT_MS = (() => {
  const raw = Number(process.env.DEVICE_WAIT_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 2000 && raw <= 55_000) return Math.floor(raw);
  return 8_000;
})();

type QueuedNote = {
  id: string;
  body: string;
  created_at: string;
  status: "queued" | "delivered" | "seen";
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const auth = await requireDeviceAuth(request, url);
  if (auth instanceof NextResponse) return auth;

  const fwHeader = request.headers.get("x-firmware-version")?.trim().slice(0, 32);
  const now = new Date().toISOString();

  // Liveness + optional firmware version sync (desk may have been registered
  // on an older sketch; header keeps the Devices card truthful without re-pair).
  const livenessPatch: Record<string, string | boolean> = {
    last_seen_at: now,
    online: true,
  };
  if (fwHeader) livenessPatch.firmware_version = fwHeader;

  await auth.supabase.from("devices").update(livenessPatch).eq("id", auth.deviceId);

  if (!auth.ownerId) {
    return NextResponse.json({ message: null, reason: "unpaired" });
  }

  const ownerId = auth.ownerId;

  // Paired — surface a bit of context so the device can render a friendly
  // "Paired as <desk name>" screen instead of a generic banner.
  const [deskRes, ownerRes, lastNoteRes] = await Promise.all([
    auth.supabase
      .from("devices")
      .select("name, location_name, theme, accent_color")
      .eq("id", auth.deviceId)
      .maybeSingle(),
    auth.supabase
      .from("profiles")
      .select("display_name")
      .eq("id", ownerId)
      .maybeSingle(),
    auth.supabase
      .from("notes")
      .select("body")
      .eq("recipient_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const desk = {
    name: (deskRes.data?.name as string | null) ?? null,
    location_name: (deskRes.data?.location_name as string | null) ?? null,
    theme: (deskRes.data?.theme as string | null) ?? null,
    accent_color: (deskRes.data?.accent_color as string | null) ?? null,
  };
  const owner = {
    display_name: (ownerRes.data?.display_name as string | null) ?? null,
  };
  // ESP32 firmware uses a tiny flat JSON string extractor (no nested paths).
  // Mirror nested `message` / `desk` / `owner` as top-level keys so `id`,
  // `body`, `name`, `location_name`, `display_name` are findable the same way
  // as on `/api/device/latest`.
  const lastMessageBody =
    typeof lastNoteRes.data?.body === "string" ? lastNoteRes.data.body : null;

  const withContext = (body: Record<string, unknown>) => {
    const m = body.message as
      | { id?: string; body?: string; created_at?: string; status?: string }
      | null
      | undefined;
    const flat: Record<string, unknown> = {
      ...body,
      desk,
      owner,
    };
    if (m && typeof m === "object" && m.id && typeof m.body === "string") {
      flat.id = m.id;
      flat.body = m.body;
    }
    if (desk.name != null) flat.name = desk.name;
    if (desk.location_name != null) flat.location_name = desk.location_name;
    if (owner.display_name != null) flat.display_name = owner.display_name;
    if (desk.theme != null) flat.theme = desk.theme;
    if (desk.accent_color != null) flat.accent_color = desk.accent_color;
    if (lastMessageBody != null) flat.last_message_body = lastMessageBody;
    return flat;
  };

  const fetchQueuedNote = async (): Promise<QueuedNote | null> => {
    const { data, error } = await auth.supabase
      .from("notes")
      .select("id, body, created_at, status")
      .eq("recipient_id", ownerId)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as QueuedNote | null) ?? null;
  };

  // Fast path: a note is already queued (arrived between waits, or the device
  // is reconnecting after a network blip). Return without touching realtime.
  try {
    const pre = await fetchQueuedNote();
    if (pre) return NextResponse.json(withContext({ message: pre }));
  } catch (err) {
    return NextResponse.json(
      { error: "query_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }

  // Slow path: subscribe and block until INSERT or timeout.
  const payload = await new Promise<QueuedNote | null>((resolve) => {
    let resolved = false;
    const finish = (value: QueuedNote | null) => {
      if (resolved) return;
      resolved = true;
      auth.supabase.removeChannel(channel).catch(() => {});
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const onAbort = () => finish(null);
    request.signal.addEventListener("abort", onAbort);

    const timer = setTimeout(() => finish(null), WAIT_TIMEOUT_MS);

    const channel = auth.supabase
      .channel(`desknote-wait-${auth.deviceId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notes",
          filter: `recipient_id=eq.${ownerId}`,
        },
        (event) => {
          const row = event.new as Partial<QueuedNote> & {
            recipient_id?: string;
          };
          if (!row?.id || !row?.body || row?.status !== "queued") return;
          finish({
            id: row.id,
            body: row.body,
            created_at: row.created_at ?? new Date().toISOString(),
            status: "queued",
          });
        }
      )
      .subscribe(async (status) => {
        // Once the subscription is live, do one more fetch to close the tiny
        // race window between the fast-path query and subscription attach.
        if (status !== "SUBSCRIBED") return;
        try {
          const gap = await fetchQueuedNote();
          if (gap) finish(gap);
        } catch {
          // Ignore; the timeout path will still resolve.
        }
      });
  });

  return NextResponse.json(withContext({ message: payload }));
}
