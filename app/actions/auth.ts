"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import { DEFAULT_LOGIN_PATH } from "@/lib/auth/routes";

function loginUrl(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `${DEFAULT_LOGIN_PATH}?${q.toString()}`;
}

/**
 * Sends a one-time magic link to the email. New users are created automatically.
 * Configure Supabase: Authentication → URL configuration → add your production URL
 * and redirect: https://your-domain.com/auth/callback
 */
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  if (!email) {
    redirect(loginUrl({ error: encodeURIComponent("Enter your email address.") }));
  }

  const supabase = createClient(await cookies());
  const origin = await getSiteUrl();
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo,
    },
  });

  if (error) {
    redirect(loginUrl({ error: encodeURIComponent(error.message) }));
  }

  redirect(loginUrl({ sent: "1" }));
}

export async function signOut() {
  const supabase = createClient(await cookies());
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(DEFAULT_LOGIN_PATH);
}
