import Link from "next/link";
import { notFound } from "next/navigation";
import { getLock } from "@/locks.config";
import { LockGame } from "@/components/LockGame";
import { DecoFrame, Icon } from "@/components/ui";
import { config } from "@/lib/config";
import { isDay, numberFor, todayDate } from "@/lib/day";
import { getCatalog, lookupFor } from "@/lib/engine/catalog";
import { evaluate } from "@/lib/engine/play";
import { dayMeta, getPuzzle } from "@/lib/server/puzzles";
import { RULES } from "@/lib/i18n/rules";
import { t } from "@/lib/i18n/en";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lock = getLock(slug);
  return lock ? { title: `${lock.name} — ${lock.subtitle}` } : {};
}

export default async function LockPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { d } = await searchParams;
  const lock = getLock(slug);
  if (!lock) notFound();
  const today = todayDate();
  const date = isDay(d) && d < today ? d : today;
  const [row, meta, catalog] = await Promise.all([getPuzzle(date, slug), dayMeta(date), getCatalog()]);
  const number = numberFor(date);
  const available = meta.filter((m) => m.state === "available").map((m) => m.slug);
  const back = date < today ? `/archive/${date}` : "/";

  return (
    <div className="mx-auto max-w-[760px] px-4 py-5 md:py-8">
      <div className="mb-5 flex items-center gap-3">
        <Link href={back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label={t.nav.back}>
          <Icon name="back" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="smallcaps text-xs text-brass">{lock.numeral} · {date === today ? "Today" : date} · #{number}</p>
          <h1 className="font-display text-2xl leading-tight text-paper md:text-3xl">{lock.name}</h1>
          <p className="text-sm text-ash">{lock.subtitle}</p>
        </div>
      </div>
      {row ? (
        <LockGame
          slug={slug}
          date={date}
          number={number}
          initialView={evaluate(lock, row, number, [], undefined, lookupFor(catalog, lock.guess))}
          entries={lock.guess === "number" || lock.guess === "omen" ? [] : catalog[lock.guess]}
          site={config.siteUrl}
          available={available}
          rules={RULES[slug]}
        />
      ) : (
        <DecoFrame className="p-8 text-center">
          <p className="font-display text-xl">{t.lock.empty}</p>
        </DecoFrame>
      )}
    </div>
  );
}
