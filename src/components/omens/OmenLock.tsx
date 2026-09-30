"use client";
// Daily Omen lock: wraps OmenGame with local progress (souls = score, "opened" once locked in).
import Link from "next/link";
import { useMemo } from "react";
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import type { OmenAnswer, OmenKind } from "@/lib/omens/types";
import type { OmenView } from "@/lib/omens/serve";
import type { OmenMapMeta } from "@/lib/omens/map";
import { omenTicks } from "@/lib/omens/scoring";
import { shareOmen } from "@/lib/game/scoring";
import { t } from "@/lib/i18n/en";
import { useGame } from "../GameProvider";
import { ShareButton } from "../WinPanel";
import { DecoFrame, Icon, KeyholeLoader } from "../ui";
import { OmenGame } from "./OmenGame";
import type { OmenCatalog } from "./OmenPanels";

type Props = {
  slug: string; date: string; number: number; initial: OmenView; cat: OmenCatalog; map: OmenMapMeta;
  site: string; available: string[]; rules: string;
};

export function OmenLock({ slug, date, number, initial, cat, map, site, available, rules }: Props) {
  const lock = LOCK_BY_SLUG[slug];
  const { store, hydrated, today, setRecord } = useGame();
  const rec = store.progress[date]?.[slug];
  const isArchive = date < today;

  const submit = async (answers: OmenAnswer): Promise<OmenView> => {
    const res = await fetch("/api/omen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, slug, answers }) });
    if (!res.ok) throw new Error(`omen ${res.status}`);
    return res.json();
  };

  const nextHref = useMemo(() => {
    const day = store.progress[date] ?? {};
    const idx = LOCKS.findIndex((l) => l.slug === slug);
    const order = [...LOCKS.slice(idx + 1), ...LOCKS.slice(0, idx)];
    const next = order.find((l) => available.includes(l.slug) && !["won", "lost"].includes(day[l.slug]?.s ?? ""));
    const q = isArchive ? `?d=${date}` : "";
    return next ? `/lock/${next.slug}${q}` : isArchive ? `/archive/${date}` : "/";
  }, [store.progress, date, slug, available, isArchive]);

  if (!hydrated) return <KeyholeLoader />;

  return (
    <div className="space-y-5 pb-10">
      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-brass"><Icon name="question" className="h-5 w-5" /> {t.lock.rules}</summary>
        <DecoFrame className="mt-2 p-4 leading-relaxed text-paper/90" corners={false}><p>{rules}</p></DecoFrame>
      </details>
      {isArchive && <div className="rounded-sm border border-brass/50 bg-brass/10 px-4 py-2 text-center text-sm text-brass">{t.vault.archiveBanner}</div>}
      <OmenGame
        omen={slug as OmenKind}
        initial={initial}
        cat={cat}
        map={map}
        saved={rec?.o as OmenAnswer | undefined}
        submit={submit}
        onLocked={(v, answers) => {
          if (rec?.o) return;
          setRecord(date, slug, {
            // Signed in: the account's recorded answers win (the Omen may be locked in on another device).
            g: [], o: (v as OmenView & { account?: { answers: OmenAnswer } }).account?.answers ?? answers,
            s: "won", w: 0, h: 0, souls: v.reveal!.result.total,
            archive: isArchive, at: Date.now(),
          });
        }}
        footer={(reveal) => (
          <>
            <ShareButton text={shareOmen({ lock, number, ticks: omenTicks(reveal.result), souls: reveal.result.total, site })} />
            <Link href={nextHref} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 py-2 text-ecto hover:bg-ecto/20">
              {t.lock.nextLock} <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link href="/omens/practice" className="inline-flex min-h-11 items-center px-3 text-ash hover:text-paper">Practice more Omens</Link>
          </>
        )}
      />
    </div>
  );
}
