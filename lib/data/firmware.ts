import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type FirmwareRelease = {
  version: string;
  notes: string | null;
  published_at: string;
};

/** The newest published build, or null when there is none (or no migration yet). */
export async function fetchLatestFirmwareRelease(
  supabase: SupabaseClient<Database>
): Promise<FirmwareRelease | null> {
  const { data } = await supabase
    .from("firmware_releases")
    .select("version, notes, published_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FirmwareRelease | null) ?? null;
}
