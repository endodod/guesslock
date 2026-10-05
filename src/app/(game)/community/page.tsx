import Link from "next/link";
import { listCommunityPuzzles } from "@/lib/community/service";
import { currentUser } from "@/lib/auth/server";
import { DecoFrame } from "@/components/ui";

export const metadata = { title: "Community puzzles" };

const KINDS = [["", "All"], ["seance", "Sorting tables"], ["constellation", "Constellations"]] as const;
const SORTS = [["new", "Newest"], ["popular", "Most played"]] as const;
const NOUN: Record<string, string> = { hero: "heroes", item: "items", ability: "abilities" };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ kind?: string; sort?: string; mine?: string }> }) {
  const { kind = "", sort = "new", mine } = await searchParams;
  const user = await currentUser();
  const puzzles = await listCommunityPuzzles({
    kind: kind === "seance" || kind === "constellation" ? kind : undefined,
    sort: sort === "popular" ? "popular" : "new",
    author: mine && user ? user.id : undefined,
  });
  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams({ ...(kind ? { kind } : {}), ...(sort !== "new" ? { sort } : {}), ...(mine ? { mine } : {}), ...over });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    const s = q.toString();
    return `/community${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) => `inline-flex min-h-11 items-center rounded-[3px] border px-3 text-sm ${active ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash hover:text-paper"}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-paper md:text-4xl">Community puzzles</h1>
          <p className="mt-1 text-ash">Sorting tables and Constellations made by players. Just for fun: no souls, no streaks.</p>
        </div>
        <Link href={user ? "/community/new" : "/auth/sign-in?next=/community/new"} className="inline-flex min-h-12 items-center rounded-[3px] border border-ecto/70 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20">
          Make a puzzle
        </Link>
      </div>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter">
        {KINDS.map(([k, label]) => <Link key={k} href={href({ kind: k })} className={chip(kind === k)}>{label}</Link>)}
        <span className="mx-1 hidden w-px bg-brass/20 sm:block" />
        {SORTS.map(([s, label]) => <Link key={s} href={href({ sort: s })} className={chip(sort === s)}>{label}</Link>)}
        {user && <Link href={href({ mine: mine ? "" : "1" })} className={chip(!!mine)}>Mine</Link>}
      </nav>

      {puzzles.length === 0 ? (
        <DecoFrame className="p-8 text-center">
          <p className="font-display text-xl text-paper">{mine ? "You haven't made a puzzle yet." : "No puzzles here yet."}</p>
          <p className="mt-2 text-ash">Be the first: make a sorting table or a Constellation for others to crack.</p>
        </DecoFrame>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {puzzles.map((p) => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="deco flex h-full gap-3 rounded-sm p-3 hover:border-brass">
                {p.images.length ? (
                  <span className="grid h-16 w-16 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-sm bg-ink">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.images.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" loading="lazy" className="h-full w-full object-cover" />)}
                  </span>
                ) : (
                  <span className="grid h-16 w-16 shrink-0 grid-cols-3 place-items-center rounded-sm border border-cursed/30 bg-cursed/10 font-display text-xs text-brass/70" aria-hidden>
                    {Array.from({ length: 9 }, (_, i) => <span key={i}>✦</span>)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="smallcaps block text-[0.65rem] text-cursed">{p.kind === "seance" ? `Sorting · ${NOUN[p.entity ?? "hero"]}` : "Constellation"}</span>
                  <span className="block truncate font-display text-lg text-paper">{p.title}</span>
                  <span className="block truncate text-xs text-ash">by {p.author} · {p.plays} {p.plays === 1 ? "play" : "plays"} · {p.solves} solved</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
