import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";

/**
 * GET /api/device/latest?deviceId=<uuid> — newest **queued** note for this display’s owner.
 * Also bumps `last_seen_at` / `online` and returns the same **flat** desk context keys as
 * `/api/device/wait` (`theme`, `accent_color`, `name`, `last_message_body`, …) so firmware
 * that polls `/latest` on a timer or tap still applies the theme chosen in the web app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const auth = await requireDeviceAuth(request, url);
  if (auth instanceof NextResponse) return auth;

  const now = new Date().toISOString();
  await auth.supabase
    .from("devices")
    .update({ last_seen_at: now, online: true })
    .eq("id", auth.deviceId);

  if (!auth.ownerId) {
    return NextResponse.json({
      message: null,
      reason: "unpaired",
    });
  }

  const ownerId = auth.ownerId;

  const [deskRes, ownerRes, lastNoteRes, queuedRes] = await Promise.all([
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
    auth.supabase
      .from("notes")
      .select("id, body, created_at, status")
      .eq("recipient_id", ownerId)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstErr =
    deskRes.error ?? ownerRes.error ?? lastNoteRes.error ?? queuedRes.error;
  if (firstErr) {
    return NextResponse.json(
      { error: "query_failed", detail: firstErr.message },
      { status: 500 }
    );
  }

  const desk = deskRes.data;
  const owner = ownerRes.data;
  const lastBody =
    typeof lastNoteRes.data?.body === "string" ? lastNoteRes.data.body : null;

  const payload: Record<string, unknown> = {};

  if (desk?.name) payload.name = desk.name;
  if (desk?.location_name) payload.location_name = desk.location_name;
  if (desk?.theme) payload.theme = desk.theme;
  if (desk?.accent_color) payload.accent_color = desk.accent_color;
  if (owner?.display_name) payload.display_name = owner.display_name;
  if (lastBody !== null) payload.last_message_body = lastBody;

  const note = queuedRes.data;
  if (note) {
    const { data: msgRow } = await auth.supabase
      .from("messages")
      .select("message_type")
      .eq("note_id", note.id)
      .maybeSingle();
    const messageType = (msgRow?.message_type as string | null) ?? null;

    payload.message = {
      id: note.id,
      body: note.body,
      created_at: note.created_at,
      status: note.status,
      ...(messageType ? { message_type: messageType } : {}),
    };
    payload.id = note.id;
    payload.body = note.body;
    if (messageType) payload.message_type = messageType;
  } else {
    payload.message = null;
  }

  return NextResponse.json(payload);
}
