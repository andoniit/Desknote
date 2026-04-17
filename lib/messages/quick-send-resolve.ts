import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import type { QuickSendTargetId } from "@/lib/messages/quick-presets";

export type ResolveQuickSendResult =
  | { ok: true; deviceIds: string[] }
  | { ok: false; error: string };

/**
 * Maps “my desk / her desk / both” to concrete `devices.id` values from the paired list.
 */
export function resolveQuickSendDeviceIds(
  target: QuickSendTargetId,
  devices: PairedDeviceRow[],
  viewerUserId: string,
  partnerUserId: string | null
): ResolveQuickSendResult {
  if (!devices.length) {
    return { ok: false, error: "Pair a desk first." };
  }

  const mine = devices.filter((d) => d.owner_id === viewerUserId);
  const theirs = partnerUserId
    ? devices.filter((d) => d.owner_id === partnerUserId)
    : [];

  if (target === "my_desk") {
    if (!mine.length) {
      return { ok: false, error: "You don’t have a display paired yet." };
    }
    return { ok: true, deviceIds: mine.map((d) => d.id) };
  }

  if (target === "her_desk") {
    if (!partnerUserId) {
      return { ok: false, error: "Link with your partner to send to their desk." };
    }
    if (!theirs.length) {
      return { ok: false, error: "Their display isn’t paired yet." };
    }
    return { ok: true, deviceIds: theirs.map((d) => d.id) };
  }

  if (devices.length < 2) {
    return {
      ok: false,
      error: "Pair two desks to use “both” — or pick yours above.",
    };
  }

  return { ok: true, deviceIds: devices.map((d) => d.id) };
}
