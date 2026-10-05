import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, signInMethods } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { ensureProfile } from "@/lib/accounts/service";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { DecoFrame } from "@/components/ui";
import { AccountForms } from "@/components/AccountForms";
import { signOut } from "../auth/actions";

export const metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ steam?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/auth/sign-in?next=/account");
  const profile = await ensureProfile(user);
  const { steam } = await searchParams;
  const [stats, ranked, imported, methods] = await Promise.all([
    db.userStats.findUnique({ where: { userId: user.id } }),
    db.play.count({ where: { userId: user.id, source: "live", archive: false, status: { not: "playing" } } }),
    db.play.count({ where: { userId: user.id, source: "import" } }),
    signInMethods(user.id),
  ]);
  const streakAlive = stats?.lastDay && stats.lastDay >= addDays(todayDate(), -1);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="smallcaps text-sm text-brass">The register</p>
          <h1 className="font-display text-3xl text-paper">{profile.displayName}</h1>
          <p className="text-sm text-ash">{methods.email ?? (methods.steamId ? "Signed in with Steam" : "")}</p>
        </div>
        <form action={signOut}>
          <button className="min-h-11 rounded-[3px] border border-ash/40 px-4 text-paper hover:border-brass/60">Sign out</button>
        </form>
      </div>

      <DecoFrame className="p-5">
        <h2 className="smallcaps mb-3 text-brass">Ranked record</h2>
        <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-4">
          {[
            ["Total souls", stats?.totalSouls ?? 0],
            ["Days unlocked", stats?.daysUnlocked ?? 0],
            ["Current streak", streakAlive ? stats?.currentStreak ?? 0 : 0],
            ["Best streak", stats?.bestStreak ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-sm border border-brass/20 bg-iron/60 p-3">
              <div className="font-mono text-2xl text-paper">{value}</div>
              <div className="text-xs text-ash">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ash">
          {ranked} ranked {ranked === 1 ? "lock" : "locks"} played.
          {imported > 0 && <> {imported} imported from before you signed in (personal stats only, not ranked).</>}{" "}
          <Link href="/hall" className="text-brass underline-offset-4 hover:underline">See the leaderboards</Link> ·{" "}
          <Link href="/market" className="text-cursed underline-offset-4 hover:underline">Spend souls in The Black Market</Link> ·{" "}
          <Link href="/inventory" className="text-brass underline-offset-4 hover:underline">Your inventory</Link>
        </p>
      </DecoFrame>

      <AccountForms name={profile.displayName} showOnBoards={profile.showOnBoards} methods={methods} steamStatus={steam} />
    </div>
  );
}
