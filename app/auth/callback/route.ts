import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/utils/supabase/route-handler";
import {
  DEFAULT_AFTER_LOGIN_PATH,
  DEFAULT_LOGIN_PATH,
  RETURNING_USER_COOKIE,
  RETURNING_USER_COOKIE_MAX_AGE_S,
} from "@/lib/auth/routes";

/**
 * Supabase redirects here after email confirmation (PKCE `code` flow) when that flow is enabled.
 * Add this path under Authentication → URL configuration → Redirect URLs:
 * https://www.desknote.space/auth/callback (and http://localhost:3000/auth/callback for dev)
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

  const res = NextResponse.redirect(`${origin}${next}`);
  res.cookies.set(RETURNING_USER_COOKIE, "1", {
    path: "/",
    maxAge: RETURNING_USER_COOKIE_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}
