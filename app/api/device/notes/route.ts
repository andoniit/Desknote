import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

/**
 * Route consumed by the ESP32 desk displays.
 *
 * Auth:
 *   GET  → X-Device-Key header must match DEVICE_API_KEY, plus a device_id query param.
 *   POST → same, used to acknowledge a note was shown on the display.
 *
 * This route is excluded from the auth middleware (see middleware.ts).
 */

function deviceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? getSupabasePublishableKey();
  return createServerClient<Database>(getSupabaseUrl(), key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

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
    return NextResponse.json({ error: "missing device_id" }, { status: 400 });
  }

  const supabase = deviceClient();

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("owner_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (deviceError || !device) {
    return NextResponse.json({ error: "unknown device" }, { status: 404 });
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

  // Mark the device seen so the web app can show online status.
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
    return NextResponse.json({ error: "missing note_id" }, { status: 400 });
  }

  const supabase = deviceClient();
  const { error } = await supabase
    .from("notes")
    .update({ status: body.status ?? "delivered" })
    .eq("id", body.note_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
