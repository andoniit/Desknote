/**
 * Central place for auth-related paths. Used by middleware and redirects.
 */

/** Prefixes that require a signed-in user */
export const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/devices",
  "/settings",
  "/relationship",
] as const;

/** Paths where a logged-in user is sent away (e.g. to the app) */
export const AUTH_ONLY_PATH_PREFIXES = ["/login"] as const;

/** OAuth / magic-link callback and error pages — no session required */
export const PUBLIC_AUTH_PATH_PREFIXES = ["/auth/callback", "/auth/error"] as const;

export const DEFAULT_LOGIN_PATH = "/login";
export const DEFAULT_AFTER_LOGIN_PATH = "/dashboard";

/** Set after a successful sign-in or sign-up so the login form omits the name field on later visits. */
export const RETURNING_USER_COOKIE = "dn_returning_login";
export const RETURNING_USER_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 400; // ~13 months, browser will trim to 400d cap

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
