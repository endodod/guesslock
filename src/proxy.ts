// Next 16 proxy: only the account page requires a session. Everything else (the game,
// auth pages, /api/auth, static assets) stays public. It also sends a sorting box (/lock/seance) to its first table
// with a real redirect, keeping ?d= (the lock page streams, so it can't redirect with a status of its own).
import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured } from "@/lib/auth/server";
import { SEANCE_BOXES, seanceLocksOf, type SeanceBoxId } from "@/locks.config";

export default function proxy(req: NextRequest) {
  const box = /^\/lock\/([a-z]+)$/.exec(req.nextUrl.pathname)?.[1];
  if (box && box in SEANCE_BOXES) {
    const url = req.nextUrl.clone();
    url.pathname = `/lock/${seanceLocksOf(box as SeanceBoxId)[0].slug}`;
    return NextResponse.redirect(url);
  }
  // No accounts on this deployment: there is nothing to sign in to, so send visitors back to the game.
  if (!authConfigured()) return NextResponse.redirect(new URL("/", req.url));
  return auth.middleware({ loginUrl: "/auth/sign-in" })(req);
}

export const config = {
  matcher: ["/account/:path*", "/lock/seance", "/lock/bazaar", "/lock/grimoire"],
};
