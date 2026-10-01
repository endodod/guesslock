"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import type { CatalogEntry, PlayView } from "@/lib/engine/types";
import { ignoredSlugs, lockStats, type LockRecord } from "@/lib/client/store";
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

/** Signed-in responses carry the account's authoritative guess list. */
type PlayResponse = PlayView & { account?: { guesses: string[]; bonus?: string; ranked: boolean } };

async function evaluateRemote(body: { date: string; slug: string; guesses: string[]; bonus?: string; noHints: boolean; hard?: boolean; giveUp?: boolean }): Promise<PlayResponse> {
  const res = await fetch("/api/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`play ${res.status}`);
  return res.json();
}

export function LockGame({ slug, date, number, initialView, entries, site, available, rules }: Props) {
  const lock = LOCK_BY_SLUG[slug];
  const { store, hydrated, today, setRecord, play, toast, user } = useGame();
  const rec = store.progress[date]?.[slug];
  const [view, setView] = useState<PlayView>(initialView);
  const [ranked, setRanked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const restored = useRef(false);
  // Signed in: always ask the server (the lock may have been played on another device).
  const restoring = hydrated && !restoreDone && (!!user || (!!rec && (rec.g.length > 0 || !!rec.b)));
  const [showRules, setShowRules] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  // Bumped on every wrong guess so the input can shake.
  const [wrongPulse, setWrongPulse] = useState(0);
  // The "Click." popup, shown when a guess opens the lock (not when a finished lock is restored).
  const [popup, setPopup] = useState<{ tries: number; souls: number } | null>(null);
  const isArchive = date < today;
  const noHints = store.settings.noHints;
  const hard = store.settings.hardMode;
  // "Skip sound locks": those locks never count and are never suggested as the next lock.
  const skipSound = store.settings.skipSound;
  const ignored = useMemo(() => ignoredSlugs({ skipSound }), [skipSound]);

  const persist = useCallback(
    (v: PlayResponse, guessesIn: string[], bonusIn?: string, giveUp?: boolean) => {
      // The account's list wins over what this device sent.
      const guesses = v.account?.guesses ?? guessesIn;
      const bonus = v.account ? v.account.bonus : bonusIn;
      if (v.account) setRanked(v.account.ranked);
      if (guesses.length === 0 && !bonus) return;
      const done = v.status === "won" || v.status === "lost";
      const hintsUsed = noHints ? 0 : v.hintsUsed;
      const bonusCorrect = v.bonus?.correct ?? false;
      const next: LockRecord = {
        g: guesses,
        b: bonus,
        gu: giveUp || rec?.gu || v.gaveUp || undefined,
        ranked: v.account?.ranked,
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
    [noHints, rec, isArchive, setRecord, date, slug],
  );

  // Restore saved guesses (local or account) once hydrated.
  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    if (user || (rec && (rec.g.length || rec.b))) {
      evaluateRemote({ date, slug, guesses: rec?.g ?? [], bonus: rec?.b, noHints, hard, giveUp: rec?.gu })
        .then((v) => { setView(v); persist(v, rec?.g ?? [], rec?.b); })
        .catch(() => toast(t.lock.error))
        .finally(() => setRestoreDone(true));
    } else {
      void Promise.resolve().then(() => setRestoreDone(true));
    }
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!popup) return;
    const id = setTimeout(() => setPopup(null), 2600);
    return () => clearTimeout(id);
  }, [popup]);

  const guessed = useMemo(() => new Set(view.rows.map((r) => r.id)), [view.rows]);
  const done = view.status === "won" || view.status === "lost";

  /** Resolves to true when the guess opened the lock. */
  const onGuess = async (id: string): Promise<boolean> => {
    if (busy || done || guessed.has(id)) return false;
    setBusy(true);
    setRestoreDone(true);
    const guesses = [...view.rows.map((r) => r.id), id];
    try {
      const v = await evaluateRemote({ date, slug, guesses, noHints, hard });
      setView(v);
      persist(v, guesses);
      if (v.status === "won") {
        play("click");
        setPopup({ tries: v.rows.length, souls: soulsFor({ won: true, guesses: v.rows.length, hintsUsed: noHints ? 0 : v.hintsUsed }) });
        const dayRecs = { ...(store.progress[date] ?? {}), [slug]: { s: "won" } };
        if (available.filter((s) => !ignored.has(s)).every((s) => ["won", "lost"].includes((dayRecs as Record<string, { s: string }>)[s]?.s))) {
          setTimeout(() => play("creak"), 500);
        }
        return true;
      }
      play("tick");
      setWrongPulse((n) => n + 1);
      return false;
    } catch {
      toast(t.lock.error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onGiveUp = async () => {
    setConfirmGiveUp(false);
    if (busy || done || !view.rows.length) return;
    setBusy(true);
    const guesses = view.rows.map((r) => r.id);
    try {
      const v = await evaluateRemote({ date, slug, guesses, noHints, hard, giveUp: true });
      setView(v);
      persist(v, guesses, undefined, true);
      play("tick");
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
      const v = await evaluateRemote({ date, slug, guesses, bonus: id, noHints, hard, giveUp: rec?.gu });
      setView(v);
      persist(v, guesses, id, rec?.gu);
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
    const next = order.find((l) => available.includes(l.slug) && !ignored.has(l.slug) && !["won", "lost"].includes(day[l.slug]?.s ?? ""));
    const q = isArchive ? `?d=${date}` : "";
    return next ? `/lock/${next.slug}${q}` : isArchive ? `/archive/${date}` : "/";
  }, [store.progress, date, slug, available, isArchive, ignored]);

  const stats = useMemo(() => lockStats(store.progress, slug, today), [store.progress, slug, today]);
  const souls = rec?.souls ?? soulsFor({ won: view.status === "won", guesses: view.rows.length, hintsUsed: view.hintsUsed });
  const shareText = shareLock({ lock, number, result: { status: view.status === "won" ? "won" : "lost", guesses: view.rows.length, souls }, site });
  const shareGridText = lock.attributeGrid && view.status === "won"
    ? shareLock({ lock, number, result: { status: "won", guesses: view.rows.length, souls }, site, grid: view.rows.map((r) => r.tiles ?? []) })
    : undefined;

  const placeholder = t.lock.placeholder[lock.guess];
  const hideHints = store.settings.noHints;
  const hintAt = hideHints ? [] : lock.hints.map((h) => h.after);
  // Unlimited-guess locks can be given up once at least one guess is in.
  const canGiveUp = !done && !lock.maxTries && view.rows.length > 0 && !restoring;
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
        <div className="flex items-center">
          {canGiveUp && !confirmGiveUp && (
            <button type="button" onClick={() => setConfirmGiveUp(true)} className="min-h-11 px-2 text-sm text-ash underline-offset-4 hover:text-paper hover:underline">
              {t.lock.giveUp}
            </button>
          )}
          <button type="button" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules} className="flex h-11 w-11 items-center justify-center text-brass" aria-label={t.lock.rules}>
            <Icon name="question" className="h-6 w-6" />
          </button>
        </div>
      </div>
      {canGiveUp && confirmGiveUp && (
        <div role="alertdialog" aria-label={t.lock.giveUp} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-sm border border-[#b0433f]/40 bg-[#b0433f]/10 px-3 py-1.5 text-sm">
          <span className="mr-auto text-paper/90">{t.lock.giveUpConfirm}</span>
          <button type="button" onClick={onGiveUp} disabled={busy} className="min-h-11 rounded-[3px] border border-[#b0433f]/60 px-3 text-[#e6a3a0] hover:bg-[#b0433f]/15 disabled:opacity-40">
            {t.lock.giveUpYes}
          </button>
          <button type="button" onClick={() => setConfirmGiveUp(false)} className="min-h-11 px-2 text-ash hover:text-paper">
            {t.lock.giveUpNo}
          </button>
        </div>
      )}
      {showRules && (
        <DecoFrame className="p-4 text-sm leading-relaxed text-paper/90" corners={false}>
          <p>{rules}</p>
          {["echo", "utterance", "colloquy"].includes(slug) && (
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
      {lock.needsAudio && skipSound && (
        <div className="rounded-sm border border-brass/30 px-4 py-2 text-center text-sm text-ash">{t.lock.skippedBanner}</div>
      )}
      {user && !isArchive && ranked === false && (
        <p className="text-center text-xs text-ash">
          Unranked: this lock was started before you signed in, so it counts for your stats but not the <Link href="/hall" className="text-brass underline-offset-4 hover:underline">leaderboards</Link>.
        </p>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {view.clue && <ClueStage clue={view.clue} rows={view.rows} done={done} subject={lock.guess === "item" ? "item" : "hero"} />}
      </motion.div>

      {restoring && <KeyholeLoader />}

      <AnimatePresence>
        {popup && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPopup(null)}
          >
            <motion.div
              role="status"
              className="deco rounded-md px-8 py-6 text-center"
              initial={{ scale: 0.85, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
            >
              <p className="font-display text-4xl text-ecto">{t.lock.correct}</p>
              <p className="mt-2 text-paper">{t.lock.openedIn(popup.tries)}</p>
              <p className="text-brass">You gain {popup.souls} {t.lock.souls}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {done ? (
        <WinPanel lock={lock} view={view} souls={souls} shareText={shareText} shareGridText={shareGridText} dist={stats.dist} nextHref={nextHref} onBonus={onBonus} />
      ) : lock.guess === "number" ? (
        <NumberInput placeholder={placeholder} busy={busy} disabled={!hydrated || restoring} shake={wrongPulse} onGuess={onGuess} postfix={view.clue?.kind === "measure" ? view.clue.postfix : undefined} />
      ) : (
        <GuessInput entries={entries} guessed={guessed} placeholder={placeholder} busy={busy} disabled={!hydrated || restoring} shake={wrongPulse} grouped={lock.guess === "ability"} onGuess={onGuess} autoFocus />
      )}

      {/* Once the lock is done, only the hints that were actually used stay on the shelf. */}
      <HintShelf hints={done ? view.hints.filter((h) => h.unlocked) : view.hints} hidden={hideHints} muffled={store.settings.muffledOnly && !done} />

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
