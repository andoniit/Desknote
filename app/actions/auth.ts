"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import {
  DEFAULT_LOGIN_PATH,
  RETURNING_USER_COOKIE,
  RETURNING_USER_COOKIE_MAX_AGE_S,
} from "@/lib/auth/routes";
import { normalizePinInput, validateSixDigitPin } from "@/lib/auth/pin";
import {
  fetchOwnDisplayName,
  normalizeDisplayName,
  upsertOwnDisplayName,
} from "@/lib/profile/display-name";

function loginUrl(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `${DEFAULT_LOGIN_PATH}?${q.toString()}`;
}

async function setReturningUserCookie() {
  const store = await cookies();
  store.set(RETURNING_USER_COOKIE, "1", {
    path: "/",
    maxAge: RETURNING_USER_COOKIE_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: true,
  });
}

/**
 * Email + 6-digit numeric PIN using Supabase Auth passwords.
 * See `.env.example` for required Supabase Dashboard settings.
 */
export async function signInOrSignUpWithEmailPin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pin = normalizePinInput(String(formData.get("pin") ?? ""));
  const displayName = normalizeDisplayName(
    String(formData.get("display_name") ?? "")
  );
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  if (!email) {
    redirect(loginUrl({ error: encodeURIComponent("Enter your email address.") }));
  }

  const pinErr = validateSixDigitPin(pin);
  if (pinErr) {
    redirect(loginUrl({ error: encodeURIComponent(pinErr) }));
  }

  const supabase = createClient(await cookies());
  const origin = await getSiteUrl();
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (!signInError && signInData.session) {
    const userId = signInData.user?.id;
    if (userId) {
      if (displayName) {
        await upsertOwnDisplayName(supabase, userId, displayName);
      } else {
        const existing = await fetchOwnDisplayName(supabase, userId);
        if (!existing) {
          const fromMetadata = normalizeDisplayName(
            (signInData.user?.user_metadata?.display_name as string | undefined) ?? null
          );
          if (fromMetadata) {
            await upsertOwnDisplayName(supabase, userId, fromMetadata);
          }
        }
      }
    }
    await setReturningUserCookie();
    revalidatePath("/", "layout");
    redirect(next);
  }

  const signInMsg = signInError?.message?.toLowerCase() ?? "";
  if (
    signInMsg.includes("email not confirmed") ||
    signInMsg.includes("not confirmed")
  ) {
    redirect(
      loginUrl({
        error: encodeURIComponent(
          "Confirm your email first (use the link we sent you), then sign in with your PIN."
        ),
      })
    );
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: pin,
    options: {
      emailRedirectTo,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (signUpError) {
    const msg = signUpError.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      redirect(
        loginUrl({
          error: encodeURIComponent(
            "That email is already in use. If it is yours, your PIN may be wrong."
          ),
        })
      );
    }
    redirect(loginUrl({ error: encodeURIComponent(signUpError.message) }));
  }

  if (signUpData.session) {
    if (displayName && signUpData.user?.id) {
      await upsertOwnDisplayName(supabase, signUpData.user.id, displayName);
    }
    await setReturningUserCookie();
    revalidatePath("/", "layout");
    redirect(next);
  }

  redirect(loginUrl({ registered: "1" }));
}

export async function signOut() {
  const supabase = createClient(await cookies());
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(DEFAULT_LOGIN_PATH);
}
