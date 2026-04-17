import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/utils/supabase/route-handler";
import { DEFAULT_AFTER_LOGIN_PATH, DEFAULT_LOGIN_PATH } from "@/lib/auth/routes";

/**
 * Supabase redirects here after the user clicks the magic link (PKCE `code` flow).
 * Add this exact path in Supabase Dashboard → Authentication → URL configuration
 * → Redirect URLs: https://<your-domain>/auth/callback
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : DEFAULT_AFTER_LOGIN_PATH;

  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent("missing_code")}`
    );
  }

  const supabase = await createRouteHandlerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
