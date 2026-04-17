import { NextResponse } from "next/server";
import { createDeviceServiceClient } from "@/lib/api/device/supabase-service";

/**
 * Legacy FIFO poll for desk displays.
 * Auth: `X-Device-Key` + `device_id` query (unchanged for older firmware).
 * New firmware should prefer GET /api/device/latest + POST /api/device/seen with Bearer token.
 */

function authorized(request: Request) {
  const key = request.headers.get("x-device-key");
  return !!key && !!process.env.DEVICE_API_KEY && key === process.env.DEVICE_API_KEY;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("device_id");
  if (!deviceId) {
    return NextResponse.json({ error: "missing_device_id" }, { status: 400 });
  }

  const supabase = createDeviceServiceClient();

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("owner_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (deviceError || !device) {
    return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  }

  if (!device.owner_id) {
    await supabase
      .from("devices")
      .update({ last_seen_at: new Date().toISOString(), online: true })
      .eq("id", deviceId);
    return NextResponse.json({ notes: [] });
  }

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, body, created_at")
    .eq("recipient_id", device.owner_id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString(), online: true })
    .eq("id", deviceId);

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { note_id?: string; status?: "delivered" | "seen" }
    | null;

  if (!body?.note_id) {
    return NextResponse.json({ error: "missing_note_id" }, { status: 400 });
  }

  const supabase = createDeviceServiceClient();
  const { error } = await supabase
    .from("notes")
    .update({ status: body.status ?? "delivered" })
    .eq("id", body.note_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
