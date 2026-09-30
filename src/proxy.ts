// Next 16 proxy: only the account page requires a session. Everything else (the game,
// auth pages, /api/auth, static assets) stays public.
import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: ["/account/:path*"],
};
