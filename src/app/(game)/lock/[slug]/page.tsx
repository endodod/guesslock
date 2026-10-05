import Link from "next/link";
import { preload } from "react-dom";
import { notFound, redirect } from "next/navigation";
import { getLock, SEANCE_BOXES, seanceLocksOf, type SeanceBoxId } from "@/locks.config";
import { SeanceLock } from "@/components/seance/SeanceLock";
import { evaluateSeance } from "@/lib/seance/play";
import { LockGame } from "@/components/LockGame";
import { DecoFrame, Icon } from "@/components/ui";
import { config } from "@/lib/config";
import { isDay, numberFor, todayDate } from "@/lib/day";
import { getCatalog, lookupFor } from "@/lib/engine/catalog";
import { codexFor } from "@/lib/codex";
import { evaluate } from "@/lib/engine/play";
import { dayMeta, getPuzzle, hardMeta } from "@/lib/server/puzzles";
import { RULES } from "@/lib/i18n/rules";
import { healToday } from "@/lib/server/heal";
import { t } from "@/lib/i18n/en";
import { OmenLock } from "@/components/omens/OmenLock";
import { getMapMeta } from "@/lib/omens/map";
import { omenView } from "@/lib/omens/serve";
import type { OmenPayload } from "@/lib/omens/types";
import type { Catalog } from "@/lib/engine/types";

/** Hero and item lookups for the Omen panels (ids -> name/icon). */
function omenCatalog(catalog: Catalog) {
  return {
    heroes: Object.fromEntries(catalog.hero.map((h) => [Number(h.id), { name: h.name, icon: h.icon }])),
    items: Object.fromEntries(catalog.item.map((i) => [Number(i.id), { name: i.name, icon: i.icon, slot: i.slot }])),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug in SEANCE_BOXES) return { title: `${SEANCE_BOXES[slug as SeanceBoxId].name} — ${SEANCE_BOXES[slug as SeanceBoxId].subtitle}` };
  const lock = getLock(slug);
  return lock ? { title: `${lock.name} — ${lock.subtitle}` } : {};
}

export default async function LockPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { d } = await searchParams;
  if (slug in SEANCE_BOXES) {
    redirect(`/lock/${seanceLocksOf(slug as SeanceBoxId)[0].slug}${d ? `?d=${d}` : ""}`);
  }
  const lock = getLock(slug);
  if (!lock) notFound();
  const today = todayDate();
  const date = isDay(d) && d < today ? d : today;
  const [row, meta, catalog, hard] = await Promise.all([getPuzzle(date, slug), dayMeta(date), getCatalog(), lock.hard || lock.hardPlay ? hardMeta(date) : null]);
  if (date === today) healToday(date, meta);
  const number = numberFor(date);
  const available = meta.filter((m) => m.state === "available").map((m) => m.slug);
  const back = date < today ? `/archive/${date}` : "/";

  const isOmen = lock.group === "omens";
  // The attribute locks need room for a tile per category.
  const wide = lock.mode === "classic" || lock.mode === "item-classic";
  // The Séance: all four tables are rendered (as tabs); each starts from its empty view.
  const seance = lock.box
    ? await Promise.all(seanceLocksOf(lock.box).map(async (l) => {
        const r = l.slug === slug ? row : await getPuzzle(date, l.slug);
        const empty = { date, mode: l.slug, sealed: true, sealedReason: "not generated", payload: {} };
        return evaluateSeance(l, r ?? empty, number, []).view;
      }))
    : null;
  const initialView = row && !isOmen && !lock.box ? evaluate(lock, row, number, [], undefined, lookupFor(catalog, lock.guess)) : null;
  // Start downloading the clue picture with the page instead of after the game component has loaded.
  if (initialView?.clue && "image" in initialView.clue && initialView.clue.image) preload(initialView.clue.image, { as: "image" });
  return (
    <div className={`mx-auto px-4 py-5 md:py-8 ${isOmen ? "max-w-6xl" : wide ? "max-w-5xl" : seance ? "max-w-[820px]" : "max-w-[760px]"}`}>
      <div className="mb-5 flex items-center gap-3">
        <Link href={back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label={t.nav.back}>
          <Icon name="back" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="smallcaps text-xs text-brass">{lock.numeral} · {date === today ? "Today" : date} · #{number}</p>
          <h1 className="font-display text-2xl leading-tight text-paper md:text-3xl">
            {lock.name}
            {lock.group === "omens" && <span className="ml-2 inline-block rounded-[2px] border border-cursed/60 px-1.5 align-middle font-mono text-[0.62rem] tracking-widest text-[#c7b2ff]">{t.earlyAccess.toUpperCase()}</span>}
          </h1>
          <p className="text-sm text-ash">{lock.subtitle}</p>
        </div>
      </div>
      {seance ? (
        <SeanceLock
          initialSlug={slug}
          date={date}
          number={number}
          tables={seance}
          site={config.siteUrl}
          available={available}
          rules={RULES.seance}
        />
      ) : isOmen && row && !row.sealed ? (
        <OmenLock
          slug={slug}
          date={date}
          number={number}
          initial={omenView(row.payload as unknown as OmenPayload)}
          cat={omenCatalog(catalog)}
          map={await getMapMeta()}
          site={config.siteUrl}
          available={available}
          rules={RULES[slug]}
        />
      ) : row && !isOmen ? (
        <LockGame
          slug={slug}
          date={date}
          number={number}
          initialView={initialView!}
          entries={lock.input || !(lock.guess === "hero" || lock.guess === "ability" || lock.guess === "item" || lock.guess === "grid") ? [] : catalog[lock.guess === "grid" ? "hero" : lock.guess]}
          codex={codexFor(lock, catalog)}
          site={config.siteUrl}
          available={available}
          rules={RULES[slug]}
          hardReady={hard?.find((m) => m.slug === `${slug}-hard`)?.state === "available"}
          hardAvailable={hard?.filter((m) => m.state === "available").map((m) => m.slug)}
        />
      ) : (
        <DecoFrame className="p-8 text-center">
          <p className="font-display text-xl">{t.lock.empty}</p>
        </DecoFrame>
      )}
      {/* LockGame has its own report link; the Séance, the Omens and an empty lock get theirs here. */}
      {!(row && !isOmen && !lock.box) && (
        <p className="mt-4 text-center text-xs">
          <Link className="inline-flex min-h-11 items-center text-ash underline-offset-4 hover:text-paper hover:underline" href={`/feedback?kind=bug&lock=${slug}&date=${date}`}>
            Something wrong with this puzzle? Report it
          </Link>
        </p>
      )}
    </div>
  );
}
