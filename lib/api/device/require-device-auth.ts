import { NextResponse } from "next/server";
import { createDeviceServiceClient } from "@/lib/api/device/supabase-service";
import { verifyDeviceToken } from "@/lib/api/device/token-crypto";
import { isValidDeviceUuid } from "@/lib/api/device/device-id";

export type AuthedDevice = {
  supabase: ReturnType<typeof createDeviceServiceClient>;
  deviceId: string;
  ownerId: string | null;
};

function parseBearer(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

function globalDeviceKeyValid(request: Request): boolean {
  const key = request.headers.get("x-device-key");
  return !!key && !!process.env.DEVICE_API_KEY && key === process.env.DEVICE_API_KEY;
}

/**
 * Authenticates a desk hardware request.
 *
 * Recommended: `Authorization: Bearer <device_token>` from NVS (issued once at register).
 * Legacy: `X-Device-Key: <DEVICE_API_KEY>` only when `device_token_hash` is still null.
 * If a token hash exists, the global key alone is **not** accepted (prevents one leaked key owning every desk).
 */
export async function requireDeviceAuth(
  request: Request,
  url: URL
): Promise<AuthedDevice | NextResponse> {
  const supabase = createDeviceServiceClient();

  const deviceIdRaw =
    request.headers.get("x-device-id")?.trim() ??
    url.searchParams.get("deviceId")?.trim() ??
    null;

  if (!isValidDeviceUuid(deviceIdRaw)) {
    return NextResponse.json(
      { error: "invalid_device_id", detail: "Use UUID from register response." },
      { status: 400 }
    );
  }

  const { data: device, error } = await supabase
    .from("devices")
    .select("id, owner_id, device_token_hash")
    .eq("id", deviceIdRaw)
    .maybeSingle();

  if (error || !device) {
    return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  }

  const bearer = parseBearer(request);
  const hasStoredToken = !!device.device_token_hash;

  if (hasStoredToken) {
    if (!bearer || !verifyDeviceToken(bearer, device.device_token_hash)) {
      return NextResponse.json(
        {
          error: "unauthorized",
          detail: "Send Authorization: Bearer <device_token> from register.",
        },
        { status: 401 }
      );
    }
    return {
      supabase,
      deviceId: device.id,
      ownerId: device.owner_id,
    };
  }

  if (!globalDeviceKeyValid(request)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        detail: "Legacy device: use X-Device-Key or register again for a device token.",
      },
      { status: 401 }
    );
  }

  return {
    supabase,
    deviceId: device.id,
    ownerId: device.owner_id,
  };
}
