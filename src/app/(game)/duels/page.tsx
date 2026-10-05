import Link from "next/link";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { listDuels } from "@/lib/duels/service";
import { DUEL_DAILY_CAP, DUEL_WIN } from "@/lib/duels/rewards";
import { DuelLobby } from "@/components/duels/DuelLobby";
import { DecoFrame } from "@/components/ui";

export const metadata = { title: "Duels" };

export default async function DuelsPage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <h1 className="font-display text-3xl text-paper md:text-4xl">Duels</h1>
      <p className="mb-6 mt-1 text-ash">Three Souls, Soul Wells and Patron&apos;s Gambit against another player. Win for souls.</p>
      {user ? (
        <DuelLobby initial={await ensureProfile(user).then(() => listDuels(user.id))} reward={DUEL_WIN} cap={DUEL_DAILY_CAP} />
      ) : (
        <DecoFrame className="p-8 text-center">
          <p className="font-display text-xl text-paper">Duels need an account.</p>
          <p className="mt-2 text-ash">Your opponent finds you by your display name, and wins pay souls into your wallet.</p>
          <Link href="/auth/sign-in?next=/duels" className="mt-4 inline-flex min-h-11 items-center rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 text-ecto hover:bg-ecto/20">Sign in</Link>
        </DecoFrame>
      )}
    </div>
  );
}
