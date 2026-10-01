"use client";
// The welcome screen for visitors who are neither signed in nor guests, and the reminder bar while playing as a guest.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGame } from "./GameProvider";
import { Button, DecoFrame, Logo } from "./ui";

export function GuestGate() {
  const { gated, startGuest } = useGame();
  const path = usePathname();
  // The sign-in pages themselves must stay reachable.
  if (!gated || path.startsWith("/auth")) return null;
  const next = encodeURIComponent(path);
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to GUESSLOCK" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-ink/95 p-4 backdrop-blur">
      <DecoFrame className="w-full max-w-md space-y-5 p-6 text-center">
        <Logo size="sm" />
        <p className="text-paper/90">Sign in to keep your stats, streaks and souls, and to appear on the leaderboards.</p>
        <div className="flex flex-col gap-2">
          <Link href={`/auth/sign-in?next=${next}`} className="flex min-h-12 items-center justify-center rounded-[3px] border border-brass bg-brass/15 px-4 text-paper hover:bg-brass/25">Sign in</Link>
          <Link href={`/auth/sign-up?next=${next}`} className="flex min-h-12 items-center justify-center rounded-[3px] border border-brass/50 px-4 text-brass hover:border-brass">Create an account</Link>
          <Button variant="ghost" onClick={startGuest}>Play as guest</Button>
        </div>
        <p className="text-xs text-ash">
          Guests can play every lock and Endless, but nothing is saved: no stats, streaks or souls, and progress is gone when you close the tab.
          The Black Market and the leaderboards need an account.
        </p>
      </DecoFrame>
    </div>
  );
}

export function GuestBanner() {
  const { guest } = useGame();
  if (!guest) return null;
  return (
    <p className="border-b border-brass/20 bg-brass/10 px-4 py-1.5 text-center text-xs text-paper/90">
      Playing as a guest: nothing is saved.{" "}
      <Link href="/auth/sign-in" className="text-brass underline-offset-4 hover:underline">Sign in</Link> to keep your stats.
    </p>
  );
}
