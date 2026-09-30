"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import type { CatalogEntry, PlayView } from "@/lib/engine/types";
import { lockStats, type LockRecord } from "@/lib/client/store";
import { shareLock, soulsFor } from "@/lib/game/scoring";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { ClueStage } from "./ClueStage";
import { GuessInput, NumberInput } from "./GuessInput";
import { AttributeGrid, GuessList, HintShelf } from "./History";
import { WinPanel } from "./WinPanel";
import { DecoFrame, Icon, KeyholeLoader, LockpickRow } from "./ui";

type Props = {
  slug: string;
  date: string;
  number: number;
  initialView: PlayView;
  entries: CatalogEntry[];
  site: string;
  available: string[]; // slugs with a playable puzzle that day
  rules: string;
};

async function evaluateRemote(body: { date: string; slug: string; guesses: string[]; bonus?: string }): Promise<PlayView> {
  const res = await fetch("/api/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`play ${res.status}`);
  return res.json();
}

export function LockGame({ slug, date, number, initialView, entries, site, available, rules }: Props) {
  const lock = LOCK_BY_SLUG[slug];
  const { store, hydrated, today, setRecord, play, toast } = useGame();
  const rec = store.progress[date]?.[slug];
  const [view, setView] = useState<PlayView>(initialView);
  const [busy, setBusy] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const restored = useRef(false);
  const restoring = hydrated && !restoreDone && !!rec && (rec.g.length > 0 || !!rec.b);
  const [showRules, setShowRules] = useState(false);
  const isArchive = date < today;

  // Restore saved guesses once localStorage is available.
  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    if (rec && (rec.g.length || rec.b)) {
      evaluateRemote({ date, slug, guesses: rec.g, bonus: rec.b })
        .then(setView)
        .catch(() => toast(t.lock.error))
        .finally(() => setRestoreDone(true));
    } else {
      void Promise.resolve().then(() => setRestoreDone(true));
    }
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    (v: PlayView, guesses: string[], bonus?: string) => {
      const done = v.status === "won" || v.status === "lost";
      const hintsUsed = store.settings.noHints ? 0 : v.hintsUsed;
      const bonusCorrect = v.bonus?.correct ?? false;
      const next: LockRecord = {
        g: guesses,
        b: bonus,
        s: v.status === "won" ? "won" : v.status === "lost" ? "lost" : "playing",
        w: v.wrong,
        h: hintsUsed,
        souls: done ? soulsFor({ won: v.status === "won", guesses: v.rows.length, hintsUsed, bonusCorrect }) : 0,
        bonusCorrect,
        archive: rec?.archive ?? isArchive,
        answer: v.answer ? { name: v.answer.name, image: v.answer.image } : undefined,
        at: done ? (rec?.at ?? Date.now()) : undefined,
      };
      setRecord(date, slug, next);
      return next;
    },
    [store.settings.noHints, rec, isArchive, setRecord, date, slug],
  );

  const guessed = useMemo(() => new Set(view.rows.map((r) => r.id)), [view.rows]);
  const done = view.status === "won" || view.status === "lost";

  const onGuess = async (id: string) => {
    if (busy || done || guessed.has(id)) return;
    setBusy(true);
    setRestoreDone(true);
    const guesses = [...view.rows.map((r) => r.id), id];
    try {
      const v = await evaluateRemote({ date, slug, guesses });
      setView(v);
      persist(v, guesses);
      if (v.status === "won") {
        play("click");
        const dayRecs = { ...(store.progress[date] ?? {}), [slug]: { s: "won" } };
        if (available.every((s) => ["won", "lost"].includes((dayRecs as Record<string, { s: string }>)[s]?.s))) {
          setTimeout(() => play("creak"), 500);
        }
      } else if (v.status === "lost") play("tick");
      else play("tick");
    } catch {
      toast(t.lock.error);
    } finally {
      setBusy(false);
    }
  };

  const onBonus = async (id: string) => {
    if (view.bonus?.picked) return;
    const guesses = view.rows.map((r) => r.id);
    try {
      const v = await evaluateRemote({ date, slug, guesses, bonus: id });
      setView(v);
      persist(v, guesses, id);
      play(v.bonus?.correct ? "click" : "tick");
    } catch {
      toast(t.lock.error);
    }
  };

  // Next lock: next unsolved by numeral order, wrapping; vault when none left.
  const nextHref = useMemo(() => {
    const day = store.progress[date] ?? {};
    const idx = LOCKS.findIndex((l) => l.slug === slug);
    const order = [...LOCKS.slice(idx + 1), ...LOCKS.slice(0, idx)];
    const next = order.find((l) => available.includes(l.slug) && !["won", "lost"].includes(day[l.slug]?.s ?? ""));
    const q = isArchive ? `?d=${date}` : "";
    return next ? `/lock/${next.slug}${q}` : isArchive ? `/archive/${date}` : "/";
  }, [store.progress, date, slug, available, isArchive]);

  const stats = useMemo(() => lockStats(store.progress, slug, today), [store.progress, slug, today]);
  const souls = rec?.souls ?? soulsFor({ won: view.status === "won", guesses: view.rows.length, hintsUsed: view.hintsUsed });
  const shareText = shareLock({ lock, number, result: { status: view.status === "won" ? "won" : "lost", guesses: view.rows.length, souls }, site });
  const shareGridText = lock.attributeGrid && view.status === "won"
    ? shareLock({ lock, number, result: { status: "won", guesses: view.rows.length, souls }, site, grid: view.rows.map((r) => r.tiles ?? []) })
    : undefined;

  const placeholder = t.lock.placeholder[lock.guess];
  const hideHints = store.settings.noHints;
  const hintAt = hideHints ? [] : lock.hints.map((h) => h.after);
  const triesLeft = lock.maxTries ? Math.max(0, lock.maxTries - view.wrong) : undefined;

  if (view.status === "sealed") {
    return (
      <DecoFrame className="p-8 text-center">
        <Icon name="seal" className="mx-auto mb-3 h-12 w-12 text-[#b0433f]" />
        <p className="font-display text-xl text-paper">{t.vault.sealed}</p>
        <p className="mt-2 text-ash">{t.lock.empty}</p>
      </DecoFrame>
    );
  }

  return (
    <div className="space-y-6 pb-28 md:pb-10">
      {/* Rules popover trigger lives in the header; the popover renders here */}
      <div className="flex items-center justify-between gap-2">
        <LockpickRow total={lock.picks} broken={view.wrong} hintAt={hintAt} glowing={view.status === "won"} triesLeft={triesLeft} />
        <button type="button" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules} className="flex h-11 w-11 items-center justify-center text-brass" aria-label={t.lock.rules}>
          <Icon name="question" className="h-6 w-6" />
        </button>
      </div>
      {showRules && (
        <DecoFrame className="p-4 text-sm leading-relaxed text-paper/90" corners={false}>
          <p>{rules}</p>
          {slug === "echo" && (
            <p className="mt-2 text-ash">
              Voice line transcriptions from the{" "}
              <a className="text-brass underline" href="https://deadlock.wiki" target="_blank" rel="noreferrer">Deadlock Wiki</a>, licensed{" "}
              <a className="text-brass underline" href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>.
            </p>
          )}
        </DecoFrame>
      )}

      {isArchive && (
        <div className="rounded-sm border border-brass/50 bg-brass/10 px-4 py-2 text-center text-sm text-brass">{t.vault.archiveBanner}</div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {view.clue && <ClueStage clue={view.clue} rows={view.rows} />}
      </motion.div>

      {restoring && <KeyholeLoader />}

      {done ? (
        <WinPanel lock={lock} view={view} souls={souls} shareText={shareText} shareGridText={shareGridText} dist={stats.dist} nextHref={nextHref} onBonus={onBonus} />
      ) : lock.guess === "number" ? (
        <NumberInput placeholder={placeholder} disabled={busy} onGuess={onGuess} postfix={view.clue?.kind === "measure" ? view.clue.postfix : undefined} />
      ) : (
        <GuessInput entries={entries} guessed={guessed} placeholder={placeholder} disabled={busy} grouped={lock.guess === "ability"} onGuess={onGuess} autoFocus />
      )}

      <HintShelf hints={view.hints} hidden={hideHints} />

      {view.clue?.kind === "grid" ? (
        <AttributeGrid columns={view.clue.columns} rows={view.rows} />
      ) : (
        <GuessList rows={view.rows} numeric={lock.guess === "number"} />
      )}

      {isArchive && (
        <p className="text-center text-sm">
          <Link className="text-brass underline-offset-4 hover:underline" href={`/archive/${date}`}>Back to this day&apos;s vault</Link>
        </p>
      )}
    </div>
  );
}
