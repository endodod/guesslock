"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import type { CatalogEntry, PlayView } from "@/lib/engine/types";
import { ignoredSlugs, lockStats, type LockRecord } from "@/lib/client/store";
import { HARD_MULTIPLIER, shareLock } from "@/lib/game/scoring";
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
  /** Endless mode: a practice puzzle (its own record, never part of the daily progress). */
  endless?: EndlessProps;
};

export type EndlessProps = {
  token: string;
  rec?: LockRecord;
  onRecord(rec: LockRecord, answerKey?: string): void;
  /** "Next puzzle" target. */
  nextHref: string;
};

/** Signed-in responses carry the account's authoritative guess list. */
type PlayResponse = PlayView & { account?: { guesses: string[]; bonus?: string; ranked: boolean }; answerKey?: string };

type PlayBody = { date: string; slug: string; guesses: string[]; bonus?: string; giveUp?: boolean; hard?: boolean };

async function post(url: string, body: unknown): Promise<PlayResponse> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`play ${res.status}`);
  return res.json();
}

export function LockGame({ slug, date, number, initialView, entries, site, available, rules, endless }: Props) {
  const lock = LOCK_BY_SLUG[slug];
  const { store, hydrated, today, setRecord, play, toast, user: account } = useGame();
  // Practice puzzles are played anonymously against /api/endless, whoever is signed in.
  const user = endless ? null : account;
  const rec = endless ? endless.rec : store.progress[date]?.[slug];
  const evaluateRemote = (body: PlayBody) =>
    endless ? post("/api/endless", { token: endless.token, guesses: body.guesses, bonus: body.bonus, giveUp: body.giveUp, hard: body.hard }) : post("/api/play", body);
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
  const isArchive = !endless && date < today;
  // "Skip sound locks": those locks never count and are never suggested as the next lock.
  const skipSound = store.settings.skipSound;
  const ignored = useMemo(() => ignoredSlugs({ skipSound }), [skipSound]);
  // Hard mode: picked before the first guess (default from Settings), then fixed for this lock.
  const [hardPick, setHardPick] = useState<boolean | null>(null);
  const started = (rec?.g.length ?? 0) > 0 || view.rows.length > 0;
  const hard = !!lock.hard && (started ? !!(rec?.hard ?? view.hard) : hardPick ?? store.settings.hardMode);

  const persist = useCallback(
    (v: PlayResponse, guessesIn: string[], bonusIn?: string, giveUp?: boolean) => {
      // The account's list wins over what this device sent.
      const guesses = v.account?.guesses ?? guessesIn;
      const bonus = v.account ? v.account.bonus : bonusIn;
      if (v.account) setRanked(v.account.ranked);
      if (guesses.length === 0 && !bonus) return;
      const done = v.status === "won" || v.status === "lost";
      const hintsUsed = v.hintsUsed;
      const bonusCorrect = v.bonus?.correct ?? false;
      const next: LockRecord = {
        g: guesses,
        b: bonus,
        gu: giveUp || rec?.gu || v.gaveUp || undefined,
        ranked: v.account?.ranked,
        s: v.status === "won" ? "won" : v.status === "lost" ? "lost" : "playing",
        w: v.wrong,
        h: hintsUsed,
        souls: done ? v.souls : 0,
        bonusCorrect,
        hard: v.hard || undefined,
        archive: rec?.archive ?? isArchive,
        answer: v.answer ? { name: v.answer.name, image: v.answer.image } : undefined,
        at: done ? (rec?.at ?? Date.now()) : undefined,
      };
      if (endless) endless.onRecord(next, v.answerKey);
      else setRecord(date, slug, next);
      return next;
    },
    [rec, isArchive, setRecord, date, slug, endless],
  );

  // Restore saved guesses (local or account) once hydrated.
  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    if (user || (rec && (rec.g.length || rec.b))) {
      evaluateRemote({ date, slug, guesses: rec?.g ?? [], bonus: rec?.b, giveUp: rec?.gu, hard: rec?.hard })
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
      const v = await evaluateRemote({ date, slug, guesses, hard });
      // A refused move (board locks: a duplicate hero, an unknown name) changes nothing and costs nothing.
      if (v.notice && v.rows.length === view.rows.length) {
        toast(v.notice);
        return false;
      }
      setView(v);
      persist(v, guesses);
      if (v.status === "won") {
        play("click");
        setPopup({ tries: v.rows.length, souls: v.souls });
        const dayRecs = { ...(store.progress[date] ?? {}), [slug]: { s: "won" } };
        if (!endless && available.filter((s) => !ignored.has(s)).every((s) => ["won", "lost"].includes((dayRecs as Record<string, { s: string }>)[s]?.s))) {
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
      const v = await evaluateRemote({ date, slug, guesses, giveUp: true, hard });
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
      const v = await evaluateRemote({ date, slug, guesses, bonus: id, giveUp: rec?.gu, hard });
      setView(v);
      persist(v, guesses, id, rec?.gu);
      play(v.bonus?.correct ? "click" : "tick");
    } catch {
      toast(t.lock.error);
    }
  };

  // Next lock: next unsolved by numeral order, wrapping; vault when none left.
  const nextHref = useMemo(() => {
    if (endless) return endless.nextHref;
    const day = store.progress[date] ?? {};
    const idx = LOCKS.findIndex((l) => l.slug === slug);
    const order = [...LOCKS.slice(idx + 1), ...LOCKS.slice(0, idx)];
    const next = order.find((l) => available.includes(l.slug) && !ignored.has(l.slug) && !["won", "lost"].includes(day[l.slug]?.s ?? ""));
    const q = isArchive ? `?d=${date}` : "";
    return next ? `/lock/${next.slug}${q}` : isArchive ? `/archive/${date}` : "/";
  }, [store.progress, date, slug, available, isArchive, ignored, endless]);

  const stats = useMemo(() => lockStats(store.progress, slug, today), [store.progress, slug, today]);
  const souls = rec?.souls ?? view.souls;
  const shareText = endless
    ? `GUESSLOCK Endless — ${lock.name}\n${view.status === "won" ? `🔓 ${view.rows.length} ${view.rows.length === 1 ? "pick" : "picks"}` : "🔒 jammed"}\n${site}`
    : shareLock({ lock, number, result: { status: view.status === "won" ? "won" : "lost", guesses: view.rows.length, souls }, site });
  const shareGridText = lock.attributeGrid && view.status === "won"
    ? shareLock({ lock, number, result: { status: "won", guesses: view.rows.length, souls }, site, grid: view.rows.map((r) => r.tiles ?? []) })
    : undefined;

  const placeholder = t.lock.placeholder[lock.guess];
  // The Decoy, The Cache and The Constellation take their guesses in the clue stage itself.
  const boardInput = lock.input === "choice" || lock.guess === "match" || lock.guess === "grid" || lock.guess === "map";
  const hintAt = lock.hints.map((h) => h.after);
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
      {endless && (
        <p className="text-center text-xs text-ash">Endless practice: souls here don&apos;t count for your tally, streak or the leaderboards.</p>
      )}
      {user && !isArchive && ranked === false && (
        <p className="text-center text-xs text-ash">
          Unranked: this lock was started before you signed in, so it counts for your stats but not the <Link href="/hall" className="text-brass underline-offset-4 hover:underline">leaderboards</Link>.
        </p>
      )}

      {lock.hard && !done && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
          {started ? (
            <span className={hard ? "text-cursed" : "text-ash"}>{hard ? `Hard mode · ${HARD_MULTIPLIER}× souls` : "Normal mode"}</span>
          ) : (
            <label className="flex min-h-11 cursor-pointer flex-wrap items-center justify-center gap-x-2 text-center">
              <input type="checkbox" checked={hard} onChange={(e) => setHardPick(e.target.checked)} disabled={restoring} className="h-5 w-5 shrink-0 accent-[var(--cursed)]" />
              <span className={hard ? "text-cursed" : "text-paper/90"}>Hard mode</span>
              <span className="text-ash">({t.lock.hardInfo[slug] ?? "a tougher clue"}, {HARD_MULTIPLIER}× souls)</span>
            </label>
          )}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {view.clue && (
          <ClueStage
            clue={view.clue} rows={view.rows} done={done} subject={lock.guess === "item" ? "item" : "hero"}
            onGuess={boardInput ? onGuess : undefined} busy={busy} disabled={!hydrated || restoring}
          />
        )}
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
        <WinPanel lock={lock} view={view} souls={souls} shareText={shareText} shareGridText={endless ? undefined : shareGridText} dist={endless ? {} : stats.dist} nextHref={nextHref} nextLabel={endless ? "Next puzzle" : undefined} practice={!!endless} onBonus={onBonus} />
      ) : boardInput ? null : lock.guess === "number" ? (
        <NumberInput placeholder={placeholder} busy={busy} disabled={!hydrated || restoring} shake={wrongPulse} onGuess={onGuess} postfix={view.clue?.kind === "measure" ? view.clue.postfix : undefined} />
      ) : (
        <GuessInput entries={entries} guessed={guessed} placeholder={placeholder} busy={busy} disabled={!hydrated || restoring} shake={wrongPulse} grouped={lock.guess === "ability"} onGuess={onGuess} autoFocus />
      )}

      {/* Once the lock is done, only the hints that were actually used stay on the shelf. */}
      <HintShelf hints={done ? view.hints.filter((h) => h.unlocked) : view.hints} />

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
