import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Edge Middleware on Vercel: runs before every matched request.
 * Delegates to updateSession() so Supabase auth cookies stay fresh.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Skip static assets and device API (header-based auth, no cookie session).
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|api/device).*)",
  ],
};
