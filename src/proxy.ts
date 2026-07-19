import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

// Auth0 v4 mounts /auth/login, /auth/logout, /auth/callback, /auth/profile
// through this proxy. It also refreshes the session cookie on every request.
// Route protection itself is done per-route (see /api/analyze).
//
// Next.js 16 renamed the `middleware` file/function convention to `proxy`
// (runs on the nodejs runtime). The Auth0 SDK entrypoint is still called
// `auth0.middleware()` — only the Next.js convention name changed.
export async function proxy(request: NextRequest) {
  return auth0.middleware(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
