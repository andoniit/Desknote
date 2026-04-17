import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";

/**
 * GET /api/device/latest?deviceId=<uuid> — newest **queued** note for this display’s owner.
 * Also bumps `last_seen_at` / `online` (cheap combined poll).
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

  const { data: note, error } = await auth.supabase
    .from("notes")
    .select("id, body, created_at, status")
    .eq("recipient_id", auth.ownerId)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 500 });
  }

  if (!note) {
    return NextResponse.json({ message: null });
  }

  return NextResponse.json({
    message: {
      id: note.id,
      body: note.body,
      created_at: note.created_at,
      status: note.status,
    },
  });
}
