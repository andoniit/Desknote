import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

/** Browser / Client Component Supabase client. */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey());
}
