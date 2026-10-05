import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityPuzzle, evaluateCommunity } from "@/lib/community/service";
import { getCatalog } from "@/lib/engine/catalog";
import { currentUser } from "@/lib/auth/server";
import { COMMUNITY_RULES } from "@/lib/i18n/rules";
import { CommunityPlay } from "@/components/community/CommunityPlay";
import { Icon } from "@/components/ui";

const NOUN: Record<string, string> = { hero: "heroes", item: "items", ability: "abilities" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await getCommunityPuzzle((await params).id);
  return p ? { title: `${p.title} — Community` } : {};
}

export default async function CommunityPuzzlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10}$/.test(id)) notFound();
  const [p, user, catalog] = await Promise.all([getCommunityPuzzle(id), currentUser(), getCatalog()]);
  if (!p) notFound();
  const noun = NOUN[p.entity ?? "hero"] ?? "heroes";
  return (
    <div className="mx-auto max-w-[820px] px-4 py-5 md:py-8">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/community" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label="All community puzzles">
          <Icon name="back" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="smallcaps text-xs text-cursed">Community · {p.kind === "seance" ? `sorting table of ${noun}` : "Constellation"}</p>
          <h1 className="font-display text-2xl leading-tight text-paper md:text-3xl">{p.title}</h1>
          <p className="text-sm text-ash">by {p.author} · {p.plays} {p.plays === 1 ? "play" : "plays"} · {p.solves} solved</p>
        </div>
      </div>
      <CommunityPlay
        id={p.id}
        initial={evaluateCommunity(p.kind, p.payload, [])}
        noun={noun}
        heroes={p.kind === "constellation" ? catalog.hero : []}
        rules={p.kind === "seance" ? COMMUNITY_RULES.seance(noun) : COMMUNITY_RULES.constellation}
        signedIn={!!user}
        isAuthor={user?.id === p.authorId}
      />
    </div>
  );
}
