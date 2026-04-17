import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

/**
 * Server-side Supabase client for device routes (service role when set — bypasses RLS).
 * Never import this module from client components.
 */
export function createDeviceServiceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? getSupabasePublishableKey();
  return createServerClient<Database>(getSupabaseUrl(), key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
