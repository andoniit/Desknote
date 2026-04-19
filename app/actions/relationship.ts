"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isValidEmail, normalizeEmail, normalizeInviteCodeInput } from "@/lib/relationship/validation";

export type CreateInviteState =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; message: string };

export type JoinInviteState =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type UnpairToggleState =
  | { ok: true; state: "requested" | "cancelled" | "dissolved"; message: string }
  | { ok: false; message: string };

function mapCreateInviteError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already_linked")) {
    return "You are already linked with someone. DeskNote is built for one pair at a time.";
  }
  if (m.includes("invalid_email")) {
    return "That email does not look quite right — double-check the address.";
  }
  if (m.includes("not_authenticated")) {
    return "You need to be signed in to create an invite.";
  }
  if (m.includes("gen_random_bytes") || m.includes("invite_code_generation_exhausted")) {
    return "We could not generate a unique invite code. Try again in a moment, or ask your host to confirm the database has pgcrypto (Supabase includes this by default).";
  }
  if (m.includes("could not find the function") || m.includes("pgrst202")) {
    return "Pairing is not set up on this project yet. Apply the Supabase migrations that define desknote_create_invite, then try again.";
  }
  if (m.includes("permission denied") || m.includes("42501")) {
    return "The database blocked this invite. Check that migrations ran and the desknote_create_invite RPC is granted to the authenticated role.";
  }
  return "We could not create an invite just now. Please try again in a moment.";
}

const joinErrors: Record<string, string> = {
  not_signed_in: "Sign in first, then come back to enter your code.",
  invalid_code: "That code looks too short. Invite codes are ten letters or numbers.",
  code_not_found:
    "We could not find that code. Ask your partner to send a fresh one, or check for typos.",
  code_expired: "This invite has expired. Ask your partner to create a new code.",
  own_invite: "That is your own invite — share it with your partner instead.",
  already_in_relationship:
    "You are already part of a pair. Leave that relationship before joining another (coming soon), or ask for help if this is unexpected.",
  email_mismatch:
    "This invite was sent to a specific email. Sign in with that same address, then try again.",
  relationship_full:
    "This invite was already used. Ask your partner for a new code if you still need to link.",
};

export async function createInviteAction(
  _prev: CreateInviteState | null,
  formData: FormData
): Promise<CreateInviteState> {
  const rawEmail = String(formData.get("invited_email") ?? "").trim();
  const invitedEmail =
    rawEmail.length > 0 ? normalizeEmail(rawEmail) : null;

  if (invitedEmail && !isValidEmail(invitedEmail)) {
    return { ok: false, message: mapCreateInviteError("invalid_email") };
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("desknote_create_invite", {
    invited_email: invitedEmail,
  });

  if (error) {
    console.error("[createInviteAction] desknote_create_invite failed:", error.message, error);
    return { ok: false, message: mapCreateInviteError(error.message) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    code?: string;
    expires_at?: string;
  } | null;

  if (!row?.code || !row?.expires_at) {
    console.error("[createInviteAction] RPC returned no code/expiry row:", data);
    return { ok: false, message: mapCreateInviteError("") };
  }

  revalidatePath("/relationship");
  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return {
    ok: true,
    code: row.code,
    expiresAt: row.expires_at,
  };
}

export async function joinInviteAction(
  _prev: JoinInviteState | null,
  formData: FormData
): Promise<JoinInviteState> {
  const raw = String(formData.get("code") ?? "");
  const normalized = normalizeInviteCodeInput(raw);

  if (normalized.length < 6) {
    return {
      ok: false,
      message: joinErrors.invalid_code,
    };
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("desknote_join_invite", {
    p_code: raw,
  });

  if (error) {
    return {
      ok: false,
      message: "Something went wrong while linking. Please try again.",
    };
  }

  const payload = data as { ok?: boolean; error?: string; already_member?: boolean } | null;

  if (!payload?.ok) {
    const key = payload?.error ?? "unknown";
    return {
      ok: false,
      message: joinErrors[key] ?? joinErrors.code_not_found,
    };
  }

  if (payload.already_member) {
    return {
      ok: true,
      message: "You are already linked in this relationship — you are all set.",
    };
  }

  revalidatePath("/relationship");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/devices");

  return {
    ok: true,
    message: "You are linked. Your desks, devices, and notes are now shared between the two of you.",
  };
}

const unpairErrors: Record<string, string> = {
  not_signed_in: "Sign in and come back — we could not verify your account.",
  not_in_pair: "You are not paired right now, so there is nothing to unpair.",
  pair_incomplete:
    "Your pair is still waiting for the other person to join. Delete the invite from Share above if you need a reset.",
};

export async function toggleUnpairAction(
  _prev: UnpairToggleState | null,
  _formData: FormData
): Promise<UnpairToggleState> {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("desknote_toggle_unpair");

  if (error) {
    console.error("[toggleUnpairAction] failed:", error.message, error);
    const m = error.message.toLowerCase();
    if (m.includes("could not find the function") || m.includes("pgrst202")) {
      return {
        ok: false,
        message:
          "Unpair is not set up on this project yet. Apply the latest Supabase migrations, then try again.",
      };
    }
    return {
      ok: false,
      message: "We could not update the pair right now. Please try again.",
    };
  }

  const payload = data as
    | { ok?: boolean; error?: string; state?: "requested" | "cancelled" | "dissolved" }
    | null;

  if (!payload?.ok) {
    const key = payload?.error ?? "unknown";
    return {
      ok: false,
      message: unpairErrors[key] ?? "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/relationship");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/devices");

  const state = payload.state ?? "requested";
  const message =
    state === "requested"
      ? "Unpair requested. We will wait for your partner to confirm."
      : state === "cancelled"
        ? "We cancelled your unpair request. You are still linked."
        : "You are unpaired. Notes and devices are no longer shared.";

  return { ok: true, state, message };
}
