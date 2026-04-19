import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type PartnerInfo = {
  partnerId: string | null;
  displayName: string | null;
  email: string | null;
};

/**
 * Friendly label to show wherever we reference the partner in UI.
 * Prefers the display name they chose; falls back to their email so the
 * user always sees something concrete; returns a generic phrase only as
 * a last resort.
 */
export function formatPartnerLabel(
  info: Pick<PartnerInfo, "displayName" | "email">,
  fallback = "your partner"
): string {
  const name = info.displayName?.trim();
  if (name && name.length > 0) return name;
  const email = info.email?.trim();
  if (email && email.length > 0) return email;
  return fallback;
}

/**
 * Authoritative "who is my partner?" lookup. Uses the `desknote_my_partner`
 * RPC (SECURITY DEFINER), which bypasses RLS and also self-heals
 * profiles.partner_id. Falls back to direct queries only if the RPC is
 * missing (e.g. migrations not yet applied).
 */
export async function resolvePartnerInfo(
  supabase: Client,
  userId: string
): Promise<PartnerInfo> {
  const { data, error } = await supabase.rpc("desknote_my_partner");

  if (!error) {
    const payload = data as
      | {
          partner_id?: string | null;
          display_name?: string | null;
          email?: string | null;
        }
      | null;
    const partnerId = payload?.partner_id ?? null;
    const rawName = payload?.display_name ?? null;
    const displayName = rawName && rawName.trim().length > 0 ? rawName : null;
    const rawEmail = payload?.email ?? null;
    const email = rawEmail && rawEmail.trim().length > 0 ? rawEmail : null;
    return { partnerId, displayName, email };
  }

  const msg = error.message?.toLowerCase() ?? "";
  if (
    !msg.includes("could not find the function") &&
    !msg.includes("pgrst202")
  ) {
    console.warn("[resolvePartnerInfo] RPC failed:", error.message);
  }

  const partnerId = await resolvePartnerUserIdLegacy(supabase, userId);
  const displayName = partnerId
    ? await resolvePartnerDisplayName(supabase, partnerId)
    : null;
  return { partnerId, displayName, email: null };
}

/**
 * @deprecated Prefer {@link resolvePartnerInfo}. Kept for call-sites that
 * only need the partner id without a display name. Internally uses the RPC
 * when available, so RLS-hidden rows no longer break the result.
 */
export async function resolvePartnerUserId(
  supabase: Client,
  userId: string
): Promise<string | null> {
  const info = await resolvePartnerInfo(supabase, userId);
  return info.partnerId;
}

async function resolvePartnerUserIdLegacy(
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

    if (other?.user_id) return other.user_id as string;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("partner_id")
    .eq("id", userId)
    .maybeSingle();

  return (profile?.partner_id as string | null | undefined) ?? null;
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
