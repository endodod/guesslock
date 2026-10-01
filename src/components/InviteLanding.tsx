"use client";
// Where an invite link leads: remembers who invited the visitor (a cookie, read by the Black Market once they have
// finished a ranked lock) and explains what happens next.
import { useEffect } from "react";
import Link from "next/link";
import { DecoFrame, Logo } from "./ui";
import { INVITE_COOKIE, INVITE_NEW } from "@/lib/market/rewards";

export function InviteLanding({ token, from, signedIn, self }: { token: string; from: string; signedIn: boolean; self: boolean }) {
  useEffect(() => {
    if (!self) document.cookie = `${INVITE_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
  }, [token, self]);
  const btn = "flex min-h-12 items-center justify-center rounded-[3px] border px-4";
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <DecoFrame className="space-y-5 p-6 text-center">
        <Logo size="sm" />
        {self ? (
          <p className="text-paper/90">This is your own invite link. Share it with a friend: when they sign up and finish a ranked lock, you both get souls.</p>
        ) : (
          <>
            <p className="font-display text-2xl text-paper">{from} invited you</p>
            <p className="text-paper/90">GUESSLOCK is a daily Deadlock guessing game. Sign up, finish one ranked lock, and claim {INVITE_NEW} souls in The Black Market.</p>
            <div className="flex flex-col gap-2">
              {signedIn ? (
                <>
                  <Link href="/" className={`${btn} border-brass bg-brass/15 text-paper hover:bg-brass/25`}>Play today&apos;s locks</Link>
                  <Link href="/market" className={`${btn} border-brass/50 text-brass hover:border-brass`}>Claim in The Black Market</Link>
                </>
              ) : (
                <>
                  <Link href="/auth/sign-up?next=/" className={`${btn} border-brass bg-brass/15 text-paper hover:bg-brass/25`}>Create an account</Link>
                  <Link href="/auth/sign-in?next=/" className={`${btn} border-brass/50 text-brass hover:border-brass`}>Sign in</Link>
                </>
              )}
            </div>
          </>
        )}
      </DecoFrame>
    </div>
  );
}
