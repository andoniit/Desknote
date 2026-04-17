/**
 * Central place for auth-related paths. Used by middleware and redirects.
 */

/** Prefixes that require a signed-in user */
export const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/devices",
  "/settings",
] as const;

/** Paths where a logged-in user is sent away (e.g. to the app) */
export const AUTH_ONLY_PATH_PREFIXES = ["/login"] as const;

/** OAuth / magic-link callback and error pages — no session required */
export const PUBLIC_AUTH_PATH_PREFIXES = ["/auth/callback", "/auth/error"] as const;

export const DEFAULT_LOGIN_PATH = "/login";
export const DEFAULT_AFTER_LOGIN_PATH = "/dashboard";

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
