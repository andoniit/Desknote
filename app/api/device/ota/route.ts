import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/api/device/require-device-auth";
import { parseOtaReport } from "@/lib/api/device/ota";

/**
 * POST /api/device/ota — the desk reporting on an update it was asked to take.
 *
 * `{"version":"main-5.1","status":"downloading"}` when it starts, or
 * `{"version":"main-5.1","status":"failed","error":"signature mismatch"}` when
 * it gives up — including after the bootloader rolled a bad build back, which
 * the older firmware reports on its first boot after the revert.
 *
 * Success is never posted here. The desk reboots into the new build and its
 * next `/latest` carries the new `X-Firmware-Version`; that is what marks the
 * update done, so "updated" only ever means the new firmware actually runs.
 *
 * A failure clears the request, so the desk is not offered the same build
 * again on its next check-in; pressing Update in the app asks afresh.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const auth = await requireDeviceAuth(request, url);
  if (auth instanceof NextResponse) return auth;

  const report = parseOtaReport(await request.json().catch(() => null));
  if (!report) {
    return NextResponse.json(
      { error: "invalid_body", detail: 'Send {"version": "...", "status": "downloading" | "failed"}.' },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const patch =
    report.status === "downloading"
      ? { ota_status: "downloading", ota_error: null, ota_status_at: now }
      : {
          ota_status: "failed",
          ota_error: report.error ?? "The desk could not install the update.",
          ota_target_version: null,
          ota_status_at: now,
        };

  // Scoped to the version the desk was actually asked for, so a stale report
  // from an earlier attempt cannot overwrite a newer request.
  const { error } = await auth.supabase
    .from("devices")
    .update(patch)
    .eq("id", auth.deviceId)
    .eq("ota_target_version", report.version);

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
