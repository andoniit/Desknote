import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";
import { isValidUuid } from "@/lib/api/device/device-id";

/**
 * POST /api/device/seen — sets a delivery note to `seen` if it belongs to this desk’s owner.
 * Body: `{ "note_id": "<uuid>" }`
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const auth = await requireDeviceAuth(request, url);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as { note_id?: string } | null;
  const noteId = typeof body?.note_id === "string" ? body.note_id.trim() : "";

  if (!isValidUuid(noteId)) {
    return NextResponse.json(
      { error: "invalid_note_id", detail: "Expected UUID note_id in JSON body." },
      { status: 400 }
    );
  }

  if (!auth.ownerId) {
    return NextResponse.json(
      { error: "device_unpaired", detail: "Pair the desk in the web app before marking seen." },
      { status: 409 }
    );
  }

  const { data: note, error: fetchErr } = await auth.supabase
    .from("notes")
    .select("id, recipient_id")
    .eq("id", noteId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: "query_failed", detail: fetchErr.message }, { status: 500 });
  }

  if (!note || note.recipient_id !== auth.ownerId) {
    return NextResponse.json(
      { error: "note_not_found", detail: "No queued message for this desk with that id." },
      { status: 404 }
    );
  }

  const { error: updateErr } = await auth.supabase
    .from("notes")
    .update({ status: "seen" })
    .eq("id", noteId)
    .eq("recipient_id", auth.ownerId);

  if (updateErr) {
    return NextResponse.json({ error: "update_failed", detail: updateErr.message }, { status: 500 });
  }

  const fwHeader = request.headers.get("x-firmware-version")?.trim().slice(0, 32);
  if (fwHeader) {
    await auth.supabase
      .from("devices")
      .update({ firmware_version: fwHeader })
      .eq("id", auth.deviceId);
  }

  return NextResponse.json({ ok: true });
}
