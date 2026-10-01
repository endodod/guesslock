import Link from "next/link";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { inventoryState } from "@/lib/market/service";
import { Inventory } from "@/components/Inventory";
import { DecoFrame } from "@/components/ui";

export const metadata = { title: "Your inventory", robots: { index: false } };

export default async function InventoryPage() {
  const user = await currentUser();
  if (user) await ensureProfile(user);
  const state = user ? await inventoryState(user.id) : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <h1 className="font-display text-3xl text-brass">Inventory</h1>
      <p className="mt-1 max-w-2xl text-ash">
        Everything you have pulled from the cases of <Link href="/market" className="text-cursed underline-offset-4 hover:underline">The Black Market</Link>.
      </p>
      {state ? (
        <Inventory initial={state} />
      ) : (
        <DecoFrame className="mt-6 p-6 text-center">
          <p className="text-paper">Inventories belong to registered keepers.</p>
          <p className="mt-3">
            <Link href="/auth/sign-up?next=/inventory" className="text-brass underline-offset-4 hover:underline">Create an account</Link> or{" "}
            <Link href="/auth/sign-in?next=/inventory" className="text-brass underline-offset-4 hover:underline">sign in</Link>.
          </p>
        </DecoFrame>
      )}
    </div>
  );
}
