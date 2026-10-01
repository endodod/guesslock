// Next 16 proxy: only the account page requires a session. Everything else (the game,
// auth pages, /api/auth, static assets) stays public.
import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured } from "@/lib/auth/server";

export default function proxy(req: NextRequest) {
  // No accounts on this deployment: there is nothing to sign in to, so send visitors back to the game.
  if (!authConfigured()) return NextResponse.redirect(new URL("/", req.url));
  return auth.middleware({ loginUrl: "/auth/sign-in" })(req);
}

export const config = {
  matcher: ["/account/:path*"],
};
