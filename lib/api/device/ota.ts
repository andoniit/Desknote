import type { AuthedDevice } from "@/lib/api/device/require-device-auth";

/**
 * Over-the-air firmware updates, server side.
 *
 * Every `/api/device/latest` call goes through `reconcileFirmware`, which does
 * three jobs in one read of the desk's row:
 *
 * 1. Records what the running firmware says about itself —
 *    `X-Firmware-Version` and `X-Desk-Capabilities` — so the apps know which
 *    version is on the desk and whether it can update itself at all.
 * 2. Closes out a finished update: once the desk reports the version it was
 *    asked to install, the request is marked `updated` and cleared.
 * 3. Otherwise, if an update is waiting, hands back the flat keys the
 *    firmware reads to install it, including a ten-minute signed URL for the
 *    image. The `firmware` bucket is private (the binary carries shared
 *    credentials), so that URL is the only way to fetch a build, and it is
 *    only ever minted for the version this one desk was asked to take.
 *
 * Values are strings throughout: the sketch's JSON reader only handles
 * string values, and it matches the first `"key":` it sees, so every key here
 * is prefixed `ota_` to stay clear of `id`, `body` and the rest.
 */

const SIGNED_URL_SECONDS = 600;

type DeskReport = {
  firmwareVersion: string | null;
  capabilities: string[] | null;
};

type FirmwareRow = {
  firmware_version: string | null;
  capabilities: string[] | null;
  ota_target_version: string | null;
  ota_status: string | null;
};

export type OtaOffer = {
  ota_version: string;
  ota_url: string;
  ota_size: string;
  ota_sha256: string;
  ota_signature: string;
};

export function readDeskReport(request: Request): DeskReport {
  const version = request.headers.get("x-firmware-version")?.trim().slice(0, 32) || null;
  const rawCapabilities = request.headers.get("x-desk-capabilities");
  const capabilities =
    rawCapabilities === null
      ? null
      : Array.from(
          new Set(
            rawCapabilities
              .split(",")
              .map((c) => c.trim().toLowerCase())
              .filter((c) => /^[a-z0-9_-]{1,24}$/.test(c))
          )
        )
          .sort()
          .slice(0, 16);
  return { firmwareVersion: version, capabilities };
}

function sameSet(a: string[] | null, b: string[] | null): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export async function reconcileFirmware(
  auth: AuthedDevice,
  report: DeskReport
): Promise<OtaOffer | null> {
  const { data: row, error } = await auth.supabase
    .from("devices")
    .select("firmware_version, capabilities, ota_target_version, ota_status")
    .eq("id", auth.deviceId)
    .maybeSingle<FirmwareRow>();

  // Before the migration runs these columns do not exist. Fail open: the
  // desk still gets its note, it just is not offered an update.
  if (error || !row) return null;

  const patch: Record<string, unknown> = {};
  if (report.firmwareVersion && report.firmwareVersion !== row.firmware_version) {
    patch.firmware_version = report.firmwareVersion;
  }
  if (report.capabilities !== null && !sameSet(report.capabilities, row.capabilities)) {
    patch.capabilities = report.capabilities;
  }

  const running = report.firmwareVersion ?? row.firmware_version;
  const capabilities = report.capabilities ?? row.capabilities ?? [];
  const target = row.ota_target_version;
  let offer: OtaOffer | null = null;

  if (target && running === target) {
    // The desk is running what it was asked to install: done. Clearing the
    // target is deliberately not one of the columns that pokes the desk.
    patch.ota_target_version = null;
    patch.ota_status = "updated";
    patch.ota_error = null;
    patch.ota_status_at = new Date().toISOString();
  } else if (target && capabilities.includes("ota") && row.ota_status !== "failed") {
    offer = await offerFor(auth, target);
  }

  if (Object.keys(patch).length > 0) {
    await auth.supabase.from("devices").update(patch).eq("id", auth.deviceId);
  }

  return offer;
}

async function offerFor(auth: AuthedDevice, version: string): Promise<OtaOffer | null> {
  const { data: release } = await auth.supabase
    .from("firmware_releases")
    .select("version, storage_path, size_bytes, sha256, signature")
    .eq("version", version)
    .maybeSingle<{
      version: string;
      storage_path: string;
      size_bytes: number;
      sha256: string;
      signature: string;
    }>();
  if (!release) return null;

  const { data: signed, error } = await auth.supabase.storage
    .from("firmware")
    .createSignedUrl(release.storage_path, SIGNED_URL_SECONDS);
  if (error || !signed?.signedUrl) {
    console.error(`could not sign firmware URL for ${version}:`, error?.message);
    return null;
  }

  return {
    ota_version: release.version,
    ota_url: signed.signedUrl,
    ota_size: String(release.size_bytes),
    ota_sha256: release.sha256,
    ota_signature: release.signature,
  };
}

/** What `POST /api/device/ota` accepts from the desk mid-update. */
export type OtaReport = {
  version: string;
  status: "downloading" | "failed";
  error: string | null;
};

export function parseOtaReport(body: unknown): OtaReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const version = typeof b.version === "string" ? b.version.trim().slice(0, 32) : "";
  const status = b.status;
  if (!version || (status !== "downloading" && status !== "failed")) return null;
  const error =
    typeof b.error === "string" && b.error.trim() ? b.error.trim().slice(0, 200) : null;
  return { version, status, error };
}
