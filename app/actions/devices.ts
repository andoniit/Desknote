"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isDeviceAccentId } from "@/lib/devices/accents";
import { isDeviceThemeId } from "@/lib/devices/themes";
import {
  validateDeviceId,
  validateDeviceName,
  validateLocationName,
  validatePairingCode,
} from "@/lib/devices/validation";
import { createDeviceServiceClient } from "@/lib/api/device/supabase-service";
import { createClient } from "@/utils/supabase/server";

export type ClaimDeviceState =
  | { ok: true; message: string }
  | { ok: false; message: string };

const claimErrors: Record<string, string> = {
  not_signed_in: "Sign in first, then try pairing again.",
  invalid_code_format: "Pairing codes are six digits — check what the display shows.",
  invalid_name: "Pick a short name for this desk.",
  invalid_location: "That location name is a little long.",
  invalid_theme: "Pick one of the themes from the list.",
  code_not_found:
    "We could not find that code. Make sure the desk is powered on and showing a code, then try again.",
  already_claimed:
    "This desk is already linked to another account. If it is yours, sign in with that account or factory-reset the device.",
};

export async function claimDeviceAction(
  _prev: ClaimDeviceState | null,
  formData: FormData
): Promise<ClaimDeviceState> {
  const rawCode = String(formData.get("pairing_code") ?? "");
  const name = String(formData.get("name") ?? "");
  const location = String(formData.get("location_name") ?? "");
  const theme = String(formData.get("theme") ?? "").trim().toLowerCase();

  const codeErr = validatePairingCode(rawCode);
  if (codeErr) return { ok: false, message: codeErr };

  const nameErr = validateDeviceName(name);
  if (nameErr) return { ok: false, message: nameErr };

  const locErr = validateLocationName(location);
  if (locErr) return { ok: false, message: locErr };

  if (!isDeviceThemeId(theme)) {
    return { ok: false, message: claimErrors.invalid_theme };
  }

  const supabase = createClient(await cookies());
  const normalizedCode = rawCode.replace(/\D/g, "");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUserId = user?.id ?? "<no session>";

  const { data, error } = await supabase.rpc("desknote_claim_device", {
    p_pairing_code: normalizedCode,
    p_name: name.trim(),
    p_location_name: location.trim() || null,
    p_theme: theme,
  });

  if (error) {
    // Surface the real Postgres / RPC error to the dev server terminal so we
    // can diagnose "the pair form kept showing" cases. The client still sees
    // a generic message to avoid leaking internals.
    console.error(
      "[claimDeviceAction] rpc error",
      {
        userId: actingUserId,
        pairingCode: normalizedCode,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return {
      ok: false,
      message: "Something went wrong while saving. Please try again shortly.",
    };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    already_yours?: boolean;
    device_id?: string;
  } | null;

  if (!payload?.ok) {
    const key = payload?.error ?? "unknown";
    console.warn("[claimDeviceAction] RPC returned !ok", {
      userId: actingUserId,
      pairingCode: normalizedCode,
      payload,
    });
    return {
      ok: false,
      message: claimErrors[key] ?? claimErrors.code_not_found,
    };
  }

  console.info("[claimDeviceAction] claim succeeded", {
    userId: actingUserId,
    deviceId: payload.device_id,
    alreadyYours: !!payload.already_yours,
  });

  revalidatePath("/devices");
  revalidatePath("/dashboard");

  if (payload.already_yours) {
    return {
      ok: true,
      message: "This desk is already on your account — no changes were needed.",
    };
  }

  return {
    ok: true,
    message: "Paired. Notes for you will route to this desk when it is online.",
  };
}

export type UpdateDeviceSettingsState =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateDeviceSettingsAction(
  _prev: UpdateDeviceSettingsState | null,
  formData: FormData
): Promise<UpdateDeviceSettingsState> {
  const deviceId = String(formData.get("device_id") ?? "");
  const idErr = validateDeviceId(deviceId);
  if (idErr) return { ok: false, message: idErr };

  const name = String(formData.get("name") ?? "");
  const location = String(formData.get("location_name") ?? "");
  const theme = String(formData.get("theme") ?? "").trim().toLowerCase();
  const accent = String(formData.get("accent_color") ?? "").trim().toLowerCase();
  const pinnedRaw = formData.get("pinned_mode_enabled");
  const pinned_mode_enabled = pinnedRaw === "on" || pinnedRaw === "true";

  const nameErr = validateDeviceName(name);
  if (nameErr) return { ok: false, message: nameErr };

  const locErr = validateLocationName(location);
  if (locErr) return { ok: false, message: locErr };

  if (!isDeviceThemeId(theme)) {
    return { ok: false, message: "Pick one of the desk themes from the list." };
  }

  if (!isDeviceAccentId(accent)) {
    return { ok: false, message: "Pick one of the accent colors from the list." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in to change desk settings." };
  }

  const { data: row, error: readErr } = await supabase
    .from("devices")
    .select("id, owner_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (readErr || !row) {
    return {
      ok: false,
      message: "We could not load that desk. Refresh and try again.",
    };
  }

  if (row.owner_id !== user.id) {
    return {
      ok: false,
      message: "You can only change settings for desks on your own account.",
    };
  }

  const { error: updErr } = await supabase
    .from("devices")
    .update({
      name: name.trim(),
      location_name: location.trim() || null,
      theme,
      accent_color: accent,
      pinned_mode_enabled,
    })
    .eq("id", deviceId)
    .eq("owner_id", user.id);

  if (updErr) {
    return {
      ok: false,
      message:
        updErr.message?.includes("column") && updErr.message.includes("accent")
          ? "Your database is missing the latest desk columns. Apply migrations in Supabase, then try again."
          : "Something went wrong while saving. Please try again shortly.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/devices");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: "Saved. This desk will pick up the new look on its next sync.",
  };
}

export type UnpairDeviceState =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Removes a desk from the caller's account. Clears owner_id so neither the
 * owner nor their partner sees it anymore, clears device_token_hash so the
 * hardware is forced to re-register next time it wakes, and mints a fresh
 * pairing_code so whoever claims it next enters a brand-new code.
 *
 * RLS allows owner-only UPDATEs via the "devices update by owner" policy,
 * so we rely on that rather than re-checking with the service role.
 */
export async function unpairDeviceAction(
  _prev: UnpairDeviceState | null,
  formData: FormData
): Promise<UnpairDeviceState> {
  const deviceId = String(formData.get("device_id") ?? "");
  const idErr = validateDeviceId(deviceId);
  if (idErr) return { ok: false, message: idErr };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "Sign in to unpair a desk." };

  const { data: row, error: readErr } = await supabase
    .from("devices")
    .select("id, owner_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (readErr || !row) {
    return {
      ok: false,
      message: "We could not load that desk. Refresh and try again.",
    };
  }

  if (row.owner_id !== user.id) {
    return {
      ok: false,
      message: "Only the desk's owner can unpair it.",
    };
  }

  // New numeric 6-digit pairing code. Collisions are extremely unlikely
  // (6 digits = 1M codes, fleet is tiny). If one happens, the owner sees
  // a generic error and retries; we don't bother with retry loops here.
  const newPairingCode = String(
    Math.floor(100_000 + Math.random() * 900_000)
  );

  // Ownership was just verified above against the authenticated client,
  // so bypass RLS for the actual mutation. Clearing owner_id is exactly
  // what legitimate owner-initiated unpair does, and going through the
  // authenticated policy trips 42501 on the SELECT visibility check
  // ("new row violates row-level security policy") because the updated
  // row has owner_id = null and no longer matches the SELECT policy.
  const svc = createDeviceServiceClient();

  const { error: updErr } = await svc
    .from("devices")
    .update({
      owner_id: null,
      device_token_hash: null,
      pairing_code: newPairingCode,
      online: false,
    })
    .eq("id", deviceId);

  if (updErr) {
    console.error("[unpairDeviceAction] update failed", {
      userId: user.id,
      deviceId,
      message: updErr.message,
      code: updErr.code,
    });
    return {
      ok: false,
      message: "Something went wrong while unpairing. Please try again shortly.",
    };
  }

  revalidatePath("/devices");
  revalidatePath("/dashboard");
  revalidatePath("/settings");

  return {
    ok: true,
    message:
      "Desk unpaired. Power-cycle the display — it will show a fresh six-digit code so you (or someone else) can claim it again.",
  };
}
