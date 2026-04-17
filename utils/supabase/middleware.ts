import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  DEFAULT_AFTER_LOGIN_PATH,
  DEFAULT_LOGIN_PATH,
  isAuthOnlyPath,
  isProtectedPath,
} from "@/lib/auth/routes";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

/**
 * Refreshes the auth session on the Edge and applies DeskNote route guards.
 * Uses the same env vars as `utils/supabase/server.ts` (URL + publishable or anon key).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  let url: string;
  let key: string;
  try {
    url = getSupabaseUrl();
    key = getSupabasePublishableKey();
  } catch {
    console.error("[DeskNote] Missing Supabase URL or publishable/anon key in middleware.");
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = DEFAULT_LOGIN_PATH;
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthOnlyPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = DEFAULT_AFTER_LOGIN_PATH;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
