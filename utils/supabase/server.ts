import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Server Supabase client. Pass the Next.js cookie store from `await cookies()`.
 *
 * @example
 * ```tsx
 * import { cookies } from "next/headers";
 * import { createClient } from "@/utils/supabase/server";
 *
 * export default async function Page() {
 *   const supabase = createClient(await cookies());
 *   const { data } = await supabase.from("todos").select();
 *   // ...
 * }
 * ```
 */
export function createClient(cookieStore: CookieStore) {
  return createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component with read-only cookies; middleware refreshes sessions.
        }
      },
    },
  });
}
