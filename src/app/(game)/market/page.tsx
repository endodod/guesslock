import Link from "next/link";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { marketState } from "@/lib/market/service";
import { Market } from "@/components/Market";
import { DecoFrame } from "@/components/ui";

export const metadata = { title: "The Black Market" };

export default async function MarketPage() {
  const user = await currentUser();
  if (user) await ensureProfile(user);
  const state = user ? await marketState(user.id) : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <h1 className="font-display text-3xl text-cursed">The Black Market</h1>
      <p className="mt-1 max-w-2xl text-ash">
        Spend the souls you earn on cosmetics: titles and name colours for the leaderboards, and themes for your Vault. Nothing here changes a puzzle or a score,
        and spending never costs you a place on the boards. Cases are bought with souls only, never with money.
      </p>
      {state ? (
        <Market initial={state} />
      ) : (
        <DecoFrame className="mt-6 p-6 text-center">
          <p className="text-paper">The market only deals with registered keepers: souls kept in a browser could be edited, so they can&apos;t be spent.</p>
          <p className="mt-3">
            <Link href="/auth/sign-up?next=/market" className="text-brass underline-offset-4 hover:underline">Create an account</Link> or{" "}
            <Link href="/auth/sign-in?next=/market" className="text-brass underline-offset-4 hover:underline">sign in</Link>. Locks played while signed in earn spendable souls.
          </p>
        </DecoFrame>
      )}
    </div>
  );
}
