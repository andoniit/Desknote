"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import { DEFAULT_LOGIN_PATH } from "@/lib/auth/routes";
import { normalizePinInput, validateSixDigitPin } from "@/lib/auth/pin";

function loginUrl(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `${DEFAULT_LOGIN_PATH}?${q.toString()}`;
}

/**
 * Email + 6-digit numeric PIN using Supabase Auth passwords.
 * See `.env.example` for required Supabase Dashboard settings.
 */
export async function signInOrSignUpWithEmailPin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pin = normalizePinInput(String(formData.get("pin") ?? ""));
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
          "Confirm your email first (check the link Supabase sent), then sign in with your PIN."
        ),
      })
    );
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: pin,
    options: { emailRedirectTo },
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
