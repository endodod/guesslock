import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getDuel, viewOf } from "@/lib/duels/service";
import { GAMES, type GameId } from "@/lib/duels/games";
import { DuelRoom } from "@/components/duels/DuelRoom";
import { Icon } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = /^[a-z0-9]{10}$/.test((await params).id) ? await getDuel((await params).id) : null;
  return d ? { title: `${GAMES[d.game as GameId].name} — Duel`, robots: { index: false } } : {};
}

export default async function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10}$/.test(id)) notFound();
  const [d, user] = await Promise.all([getDuel(id), currentUser()]);
  if (!d) notFound();
  const view = await viewOf(d, user?.id ?? null);
  return (
    <div className="mx-auto max-w-xl px-4 py-5 md:py-8">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/duels" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label="All duels">
          <Icon name="back" />
        </Link>
        <div>
          <p className="smallcaps text-xs text-cursed">Duel</p>
          <h1 className="font-display text-2xl text-paper md:text-3xl">{GAMES[view.game].name}</h1>
        </div>
      </div>
      <DuelRoom initial={view} signedIn={!!user} />
    </div>
  );
}
