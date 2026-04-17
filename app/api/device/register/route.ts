import { NextResponse } from "next/server";
import { createDeviceServiceClient } from "@/lib/api/device/supabase-service";
import { generateDeviceToken, hashDeviceToken } from "@/lib/api/device/token-crypto";

function provisioningAuthorized(request: Request) {
  const key = request.headers.get("x-device-key");
  return !!key && !!process.env.DEVICE_API_KEY && key === process.env.DEVICE_API_KEY;
}

function randomSixDigitCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/**
 * POST /api/device/register — provisioning only (`X-Device-Key`).
 * Returns `device_token` **once**; persist in NVS. Subsequent calls use `Authorization: Bearer`.
 */
export async function POST(request: Request) {
  if (!provisioningAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { firmware_version?: string }
    | null;

  const firmwareVersion =
    typeof body?.firmware_version === "string"
      ? body.firmware_version.slice(0, 32)
      : null;

  const supabase = createDeviceServiceClient();
  const device_token = generateDeviceToken();
  const device_token_hash = hashDeviceToken(device_token);

  for (let attempt = 0; attempt < 24; attempt++) {
    const pairing_code = randomSixDigitCode();
    const { data, error } = await supabase
      .from("devices")
      .insert({
        name: "New desk",
        pairing_code,
        owner_id: null,
        firmware_version: firmwareVersion,
        online: false,
        device_token_hash,
      })
      .select("id")
      .single();

    if (!error && data?.id) {
      return NextResponse.json({
        device_id: data.id,
        pairing_code,
        device_token,
      });
    }

    if (error?.code !== "23505") {
      return NextResponse.json(
        { error: "insert_failed", detail: error?.message ?? "unknown" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "could_not_allocate_code" }, { status: 503 });
}
