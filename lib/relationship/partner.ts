import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * Resolves the other person in the couple for messaging.
 * Prefers `relationship_members`; falls back to `profiles.partner_id`.
 */
export async function resolvePartnerUserId(
  supabase: Client,
  userId: string
): Promise<string | null> {
  const { data: mine } = await supabase
    .from("relationship_members")
    .select("relationship_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (mine?.relationship_id) {
    const { data: other } = await supabase
      .from("relationship_members")
      .select("user_id")
      .eq("relationship_id", mine.relationship_id)
      .neq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (other?.user_id) return other.user_id;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("partner_id")
    .eq("id", userId)
    .maybeSingle();

  return profile?.partner_id ?? null;
}

export async function getRelationshipMemberCount(
  supabase: Client,
  userId: string
): Promise<number> {
  const { data: mine } = await supabase
    .from("relationship_members")
    .select("relationship_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!mine?.relationship_id) return 0;

  const { count, error } = await supabase
    .from("relationship_members")
    .select("user_id", { count: "exact", head: true })
    .eq("relationship_id", mine.relationship_id);

  if (error) return 0;
  return count ?? 0;
}
