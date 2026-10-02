// Stateless play evaluation: (frozen payload, guesses[], bonus pick) -> full view state.
// The client stores only its guesses; the server recomputes everything, so clue content that
// hasn't been unlocked is never sent to the browser.
import type { LockDef } from "@/locks.config";
import { checkMeasure } from "./compare";
import type { BasePayload, HintValue } from "./mode";
import { hardSouls, soulsFor } from "../game/scoring";
import { MODES } from "./registry";
import type { CatalogEntry, GuessRow, HintView, PlayView } from "./types";

export type PuzzleRow = { date: string; mode: string; sealed: boolean; sealedReason: string | null; payload: unknown };

/** Letter hints come from the answer's name (also for puzzles frozen before they existed). */
function letterHint(id: string, name: string): HintValue | null {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  if (id === "initial") return { value: letters.slice(0, 1).toUpperCase() };
  if (id === "initial2") return { value: letters.slice(0, 2).toUpperCase() };
  return null;
}

export function evaluate(
  lock: LockDef,
  row: PuzzleRow,
  number: number,
  guessesIn: string[],
  bonusPick: string | undefined,
  lookup: (id: string) => CatalogEntry | undefined,
  opts: { giveUp?: boolean; hard?: boolean } = {},
): PlayView {
  const base = { slug: lock.slug, date: row.date, number, maxTries: lock.maxTries, souls: 0 };
  if (row.sealed) {
    return { ...base, status: "sealed", sealedReason: row.sealedReason ?? undefined, rows: [], wrong: 0, hints: [], hintsUsed: 0, clue: null };
  }
  const payload = row.payload as BasePayload;
  const impl = MODES[lock.mode];
  // Hard mode only exists where the mode has a hard variant.
  // A hard puzzle (a virtual lock of its own) is always hard; Endless practice can still ask for it per play.
  const hard = !!impl.hard && (!!lock.hardPlay || !!opts.hard);
  const rows: GuessRow[] = [];
  const seen = new Set<string>();
  let won = false;
  let wrong = 0;
  let notice: string | undefined;

  for (const raw of guessesIn.slice(0, 200)) {
    const g = String(raw).trim();
    // The Constellation repeats legitimately (a hero taken off and put back, the same cell emptied twice): its judge refuses real duplicates.
    if (!g || (seen.has(g) && lock.guess !== "grid")) continue;
    if (lock.maxTries && wrong >= lock.maxTries) break;
    seen.add(g);

    if (impl.judge) {
      // Board modes: the mode decides what a guess is worth; a refused move costs nothing.
      const j = impl.judge(payload, g, rows, { hard });
      if ("rejected" in j) { notice = j.rejected; continue; }
      notice = undefined;
      rows.push(j.row);
      if (j.wrong) wrong++;
      if (impl.solved?.(payload, rows)) { won = true; break; }
      continue;
    }

    if (lock.guess === "number") {
      const n = Number(g.replace(",", "."));
      if (!Number.isFinite(n)) continue;
      const value = (payload.clue as { value: number }).value;
      const r = checkMeasure(n, value);
      rows.push({ id: g, name: g, icon: null, correct: r.correct, arrow: r.arrow, close: r.correct && !r.exact });
      if (r.correct) { won = true; break; }
      wrong++;
      continue;
    }

    const entry = lookup(g);
    if (!entry) continue; // unknown / not guessable: ignore
    const correct = payload.correctIds.includes(g);
    rows.push({
      id: g, name: entry.name, icon: entry.icon, sub: entry.group, correct,
      tiles: impl.tiles?.(payload, g, { hard }) ?? undefined,
    });
    if (correct) { won = true; break; }
    wrong++;
  }

  // Giving up needs at least one real guess; it ends the puzzle as a loss and reveals the answer.
  const gaveUp = !won && !!opts.giveUp && rows.length > 0;
  const lost = !won && (gaveUp || (!!lock.maxTries && wrong >= lock.maxTries));
  const done = won || lost;

  const hints: HintView[] = lock.hints.map((h) => {
    const unlocked = wrong >= h.after;
    const v = letterHint(h.id, payload.answer.name) ?? payload.hints[h.id] ?? {};
    return {
      id: h.id, label: v.label ?? h.label, after: h.after, unlocked,
      ...(unlocked ? { value: v.value, image: v.image, audio: v.audio, gainDb: v.gainDb } : {}),
    };
  });
  // Hints unlocked before the winning guess count against souls.
  const hintsUsed = hints.filter((h) => h.unlocked).length;

  const view: PlayView = {
    ...base,
    status: won ? "won" : lost ? "lost" : "playing",
    ...(gaveUp ? { gaveUp: true } : {}),
    ...(hard ? { hard: true } : {}),
    ...(notice ? { notice } : {}),
    rows, wrong, hints, hintsUsed,
    clue: impl.clue(payload, wrong, done, { hard }, rows),
  };
  // The ability behind a bonus question is the bonus' answer: it stays out of the answer until the bonus is picked (the client
  // shows `bonus.reveal` then) or there is no bonus round (a lost lock, or a bonus whose answer was already on screen).
  const bonusReveal = payload.bonus?.reveal;
  if (done) view.answer = bonusReveal && payload.answer.extra ? { ...payload.answer, extra: { ...payload.answer.extra, ability: undefined } } : payload.answer;
  // A bonus whose answer was already shown during the game (in the clue or a guess) is not asked.
  const shown = JSON.stringify([view.clue, rows.map((r) => [r.name, r.sub])]).toLowerCase();
  const bonusAnswer = payload.bonus?.options.find((o) => o.id === payload.bonus?.answerId)?.name.toLowerCase();
  if (won && payload.bonus && !(bonusAnswer && shown.includes(bonusAnswer))) {
    const picked = bonusPick && payload.bonus.options.some((o) => o.id === bonusPick) ? bonusPick : undefined;
    view.bonus = {
      prompt: payload.bonus.prompt,
      options: payload.bonus.options,
      picked,
      ...(picked ? { correct: picked === payload.bonus.answerId, answerId: payload.bonus.answerId, reveal: payload.bonus.reveal } : {}),
    };
  }
  if (done && bonusReveal && !view.bonus) view.answer = { ...payload.answer, extra: { ...payload.answer.extra, ability: bonusReveal } };
  if (done) {
    const r = { won, rows, wrong, hintsUsed };
    const souls = impl.souls ? impl.souls(payload, r) : soulsFor({ won, guesses: rows.length, hintsUsed, bonusCorrect: !!view.bonus?.correct });
    const weighted = Math.round(souls * (lock.soulsWeight ?? 1)); // harder locks pay more, easier ones less
    view.souls = hard ? hardSouls(weighted) : weighted;
  }
  return view;
}
