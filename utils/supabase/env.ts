/**
 * Supabase URL + browser-safe key.
 * Prefer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new publishable keys, `sb_publishable_…`).
 * Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy anon JWT).
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  return url;
}

export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return key;
}
