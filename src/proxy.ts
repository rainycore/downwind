import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

// Next 16 "proxy" convention (formerly middleware). Auth0 v4 mounts
// /auth/login, /auth/logout, /auth/callback, /auth/profile through here and
// refreshes the session cookie on every request. Route protection itself is
// done per-route (see /api/analyze).
export async function proxy(request: NextRequest) {
  return auth0.middleware(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
