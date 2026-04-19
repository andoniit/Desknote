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

export type UnpairState =
  | { kind: "none" }
  | { kind: "requested_by_me" }
  | { kind: "requested_by_partner" };

/**
 * Reads the caller's relationship row (if any) and reports whether an
 * unpair has been requested and by whom. Returns `{ kind: "none" }` when
 * the user is not in a relationship or no request is pending.
 */
export async function resolveUnpairState(
  supabase: Client,
  userId: string
): Promise<UnpairState> {
  const { data: mine } = await supabase
    .from("relationship_members")
    .select("relationship_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!mine?.relationship_id) return { kind: "none" };

  const { data: rel } = await supabase
    .from("relationships")
    .select("unpair_requested_by")
    .eq("id", mine.relationship_id)
    .maybeSingle();

  const requester = rel?.unpair_requested_by as string | null | undefined;
  if (!requester) return { kind: "none" };
  if (requester === userId) return { kind: "requested_by_me" };
  return { kind: "requested_by_partner" };
}

/**
 * Returns a friendly label for the partner (display name if set, otherwise
 * `null` so callers can fall back to a generic phrase).
 * Only `profiles` is queried — auth.users is not readable from the client.
 */
export async function resolvePartnerDisplayName(
  supabase: Client,
  partnerId: string | null
): Promise<string | null> {
  if (!partnerId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", partnerId)
    .maybeSingle();

  const name = (profile?.display_name as string | null | undefined)?.trim();
  return name && name.length > 0 ? name : null;
}
