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

// Max duration hint for Vercel's Node runtime. Local `next dev` has no
// hard cap; on Vercel hobby this caps at 10 s, so keep WAIT_TIMEOUT_MS
// comfortably below 30 s for pro and 9 s for hobby.
export const maxDuration = 30;

const WAIT_TIMEOUT_MS = 25_000;

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

  // Cheap liveness bump — same as /api/device/latest does.
  const now = new Date().toISOString();
  await auth.supabase
    .from("devices")
    .update({ last_seen_at: now, online: true })
    .eq("id", auth.deviceId);

  if (!auth.ownerId) {
    return NextResponse.json({ message: null, reason: "unpaired" });
  }

  const ownerId = auth.ownerId;

  // Paired — surface a bit of context so the device can render a friendly
  // "Paired as <desk name>" screen instead of a generic banner.
  const [deskRes, ownerRes] = await Promise.all([
    auth.supabase
      .from("devices")
      .select("name, location_name")
      .eq("id", auth.deviceId)
      .maybeSingle(),
    auth.supabase
      .from("profiles")
      .select("display_name")
      .eq("id", ownerId)
      .maybeSingle(),
  ]);

  const desk = {
    name: (deskRes.data?.name as string | null) ?? null,
    location_name: (deskRes.data?.location_name as string | null) ?? null,
  };
  const owner = {
    display_name: (ownerRes.data?.display_name as string | null) ?? null,
  };
  const withContext = (body: Record<string, unknown>) => ({
    ...body,
    desk,
    owner,
  });

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
