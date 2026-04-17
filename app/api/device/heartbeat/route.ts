import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";

/**
 * POST /api/device/heartbeat — marks the desk online and refreshes `last_seen_at`.
 * Auth: Bearer device token (+ device id) per `requireDeviceAuth`.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const auth = await requireDeviceAuth(request, url);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as
    | { firmware_version?: string }
    | null;

  const firmwareVersion =
    typeof body?.firmware_version === "string"
      ? body.firmware_version.slice(0, 32)
      : undefined;

  const patch: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
    online: true,
  };
  if (firmwareVersion) patch.firmware_version = firmwareVersion;

  const { error } = await auth.supabase
    .from("devices")
    .update(patch)
    .eq("id", auth.deviceId);

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    server_time: new Date().toISOString(),
  });
}
