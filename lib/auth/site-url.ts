import { headers } from "next/headers";

/**
 * Absolute site URL for auth redirects (Server Actions / Route Handlers).
 * Vercel sets x-forwarded-proto and x-forwarded-host.
 *
 * Production: set NEXT_PUBLIC_SITE_URL (e.g. https://www.desknote.space) if headers are missing.
 */
export async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}
