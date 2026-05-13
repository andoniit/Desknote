import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolvePartnerUserId } from "@/lib/relationship/partner";

type Client = SupabaseClient<Database>;

export type PairedDeviceRow = {
  id: string;
  name: string;
  location_name: string | null;
  theme: string | null;
  accent_color: string | null;
  note_card_background: string | null;
  pinned_mode_enabled: boolean | null;
  firmware_version: string | null;
  owner_id: string;
  online: boolean | null;
  last_seen_at: string | null;
};

const DEVICE_SELECT =
  "id, name, location_name, theme, accent_color, note_card_background, pinned_mode_enabled, firmware_version, owner_id, online, last_seen_at";

/** Paired devices visible to this user (own + partner when linked). */
export async function fetchPairedDevicesForUser(
  supabase: Client,
  userId: string
): Promise<PairedDeviceRow[]> {
  // Use the authoritative partner lookup so legacy pairs (where only
  // profiles.partner_id was ever set) still see each other's desks. The
  // previous implementation queried relationship_members directly and
  // silently returned own-only devices whenever that row was missing.
  const partnerId = await resolvePartnerUserId(supabase, userId);
  const ownerIds = partnerId ? [userId, partnerId] : [userId];

  const { data } = await supabase
    .from("devices")
    .select(DEVICE_SELECT)
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: true });

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
