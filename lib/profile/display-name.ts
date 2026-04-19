import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Cleans a free-form name: collapses internal whitespace, trims, clamps
 * to DISPLAY_NAME_MAX_LENGTH. Returns null if nothing meaningful is left.
 */
export function normalizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/**
 * Upserts the caller's profile row with the given display name.
 * The caller must already be authenticated — this relies on the
 * "profiles self" RLS policy (auth.uid() = id).
 */
export async function upsertOwnDisplayName(
  supabase: Client,
  userId: string,
  displayName: string | null
): Promise<void> {
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName }, { onConflict: "id" });

  if (error) {
    console.warn("[upsertOwnDisplayName] failed:", error.message);
  }
}

/**
 * Reads the caller's current display_name from profiles.
 * Returns null when missing or unreadable.
 */
export async function fetchOwnDisplayName(
  supabase: Client,
  userId: string
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = (data?.display_name as string | null | undefined)?.trim();
  return name && name.length > 0 ? name : null;
}
