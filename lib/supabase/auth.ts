import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Helpers for authenticated access in Server Components, Server Actions,
 * and Route Handlers. Always use these (or createClient + getUser) on the
 * server — never trust client-only state for authorization.
 */

export type AuthContext = {
  supabase: ReturnType<typeof createClient>;
  user: User;
};

/**
 * Current user from the session cookie, or null if signed out.
 * Prefer this over getSession() on the server — getUser() verifies the JWT.
 */
export async function getUser(): Promise<User | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Supabase server client plus user (or null). Use when you need the client
 * for queries whether or not the user is logged in.
 */
export async function getAuth(): Promise<{
  supabase: ReturnType<typeof createClient>;
  user: User | null;
}> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Same as getAuth but guarantees a user. Redirects to /login if anonymous.
 * Use in Server Components or Server Actions that require a logged-in user.
 *
 * @param loginPath - where to send unauthenticated users (default /login)
 */
export async function requireAuth(loginPath = "/login"): Promise<AuthContext> {
  const { supabase, user } = await getAuth();
  if (!user) {
    redirect(loginPath);
  }
  return { supabase, user };
}

/**
 * Returns auth context or null (no redirect). Use in route handlers when you
 * want to return 401 JSON instead of an HTML redirect.
 */
export async function getAuthOrNull(): Promise<AuthContext | null> {
  const { supabase, user } = await getAuth();
  if (!user) return null;
  return { supabase, user };
}
