import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getRelationshipMemberCount } from "@/lib/relationship/partner";

type Client = SupabaseClient<Database>;

export type PairedDeviceRow = {
  id: string;
  name: string;
  location_name: string | null;
  theme: string | null;
  accent_color: string | null;
  pinned_mode_enabled: boolean | null;
  firmware_version: string | null;
  owner_id: string;
  online: boolean | null;
  last_seen_at: string | null;
};

const DEVICE_SELECT =
  "id, name, location_name, theme, accent_color, pinned_mode_enabled, firmware_version, owner_id, online, last_seen_at";

/** Paired devices visible to this user (own + partner when linked). */
export async function fetchPairedDevicesForUser(
  supabase: Client,
  userId: string
): Promise<PairedDeviceRow[]> {
  const memberCount = await getRelationshipMemberCount(supabase, userId);
  const { data: mine } = await supabase
    .from("relationship_members")
    .select("relationship_id")
    .eq("user_id", userId)
    .maybeSingle();

  let q = supabase
    .from("devices")
    .select(DEVICE_SELECT)
    .order("created_at", { ascending: true });

  if (mine?.relationship_id && memberCount >= 2) {
    const { data: mates } = await supabase
      .from("relationship_members")
      .select("user_id")
      .eq("relationship_id", mine.relationship_id);
    const ownerIds = mates?.map((m) => m.user_id) ?? [userId];
    q = q.in("owner_id", ownerIds);
  } else {
    q = q.eq("owner_id", userId);
  }

  const { data } = await q;
  return (data ?? []).filter(
    (d): d is PairedDeviceRow => !!d?.owner_id && typeof d.id === "string"
  );
}

/** Desks you own (settings edits are owner-only in RLS). */
export async function fetchOwnedDevicesForUser(
  supabase: Client,
  userId: string
): Promise<PairedDeviceRow[]> {
  const { data } = await supabase
    .from("devices")
    .select(DEVICE_SELECT)
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  return (data ?? []).filter(
    (d): d is PairedDeviceRow => !!d?.owner_id && typeof d.id === "string"
  );
}
