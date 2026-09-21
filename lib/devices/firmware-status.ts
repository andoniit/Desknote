import type { PairedDeviceRow } from "@/lib/data/paired-devices";

/**
 * Where a desk stands on firmware, for the Settings panel. The iOS app's
 * FirmwareUpdateSection makes the same six-way call from the same columns.
 */
export type FirmwarePhase =
  | { kind: "unknown" }
  | { kind: "needs_usb"; current: string | null }
  | { kind: "working"; target: string; downloading: boolean; since: string | null; stale: boolean }
  | { kind: "failed"; reason: string; current: string | null }
  | { kind: "up_to_date"; current: string }
  | { kind: "available"; current: string | null; latest: string };

/** A desk that is on hears the MQTT poke within seconds; ten minutes means it is off. */
const STALE_AFTER_MS = 10 * 60 * 1000;

export function firmwarePhase(
  device: Pick<
    PairedDeviceRow,
    | "firmware_version"
    | "capabilities"
    | "ota_target_version"
    | "ota_status"
    | "ota_error"
    | "ota_status_at"
  >,
  latestVersion: string | null,
  now: number = Date.now()
): FirmwarePhase {
  const current = device.firmware_version;

  if (
    device.ota_target_version &&
    (device.ota_status === "requested" || device.ota_status === "downloading")
  ) {
    const since = device.ota_status_at;
    return {
      kind: "working",
      target: device.ota_target_version,
      downloading: device.ota_status === "downloading",
      since,
      stale: since ? now - new Date(since).getTime() > STALE_AFTER_MS : false,
    };
  }
  if (!(device.capabilities ?? []).includes("ota")) return { kind: "needs_usb", current };
  if (device.ota_status === "failed") {
    return {
      kind: "failed",
      reason: device.ota_error ?? "The desk could not install it.",
      current,
    };
  }
  if (latestVersion && latestVersion !== current) {
    return { kind: "available", current, latest: latestVersion };
  }
  if (current) return { kind: "up_to_date", current };
  return { kind: "unknown" };
}
