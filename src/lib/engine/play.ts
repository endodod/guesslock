// Stateless play evaluation: (frozen payload, guesses[], bonus pick) -> full view state.
// The client stores only its guesses; the server recomputes everything, so clue content that
// hasn't been unlocked is never sent to the browser.
import type { LockDef } from "@/locks.config";
import { checkMeasure } from "./compare";
import type { BasePayload } from "./mode";
import { MODES } from "./registry";
import type { CatalogEntry, GuessRow, HintView, PlayView } from "./types";

export type PuzzleRow = { date: string; mode: string; sealed: boolean; sealedReason: string | null; payload: unknown };

export function evaluate(
  lock: LockDef,
  row: PuzzleRow,
  number: number,
  guessesIn: string[],
  bonusPick: string | undefined,
  lookup: (id: string) => CatalogEntry | undefined,
  opts: { noHints?: boolean; giveUp?: boolean } = {},
): PlayView {
  const base = { slug: lock.slug, date: row.date, number, maxTries: lock.maxTries };
  if (row.sealed) {
    return { ...base, status: "sealed", sealedReason: row.sealedReason ?? undefined, rows: [], wrong: 0, hints: [], hintsUsed: 0, clue: null };
  }
  const payload = row.payload as BasePayload;
  const impl = MODES[lock.mode];
  const rows: GuessRow[] = [];
  const seen = new Set<string>();
  let won = false;
  let wrong = 0;

  for (const raw of guessesIn.slice(0, 200)) {
    const g = String(raw).trim();
    if (!g || seen.has(g)) continue;
    if (lock.maxTries && wrong >= lock.maxTries) break;
    seen.add(g);

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
      tiles: impl.tiles?.(payload, g) ?? undefined,
    });
    if (correct) { won = true; break; }
    wrong++;
  }

  // Giving up needs at least one real guess; it ends the puzzle as a loss and reveals the answer.
  const gaveUp = !won && !!opts.giveUp && rows.length > 0;
  const lost = !won && (gaveUp || (!!lock.maxTries && wrong >= lock.maxTries));
  const done = won || lost;

  // "No hints" mode: hint values are never sent, and no hint penalty applies.
  const hints: HintView[] = lock.hints.map((h) => {
    const unlocked = !opts.noHints && wrong >= h.after;
    const v = payload.hints[h.id] ?? {};
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
    rows, wrong, hints, hintsUsed,
    clue: impl.clue(payload, wrong, done),
  };
  if (done) view.answer = payload.answer;
  // A jammed lock has no bonus round, so a bonus-protected reveal (The Resonance's ability) joins the answer.
  if (lost && payload.bonus?.reveal) view.answer = { ...payload.answer, extra: { ...payload.answer.extra, ability: payload.bonus.reveal } };
  if (won && payload.bonus) {
    const picked = bonusPick && payload.bonus.options.some((o) => o.id === bonusPick) ? bonusPick : undefined;
    view.bonus = {
      prompt: payload.bonus.prompt,
      options: payload.bonus.options,
      picked,
      ...(picked ? { correct: picked === payload.bonus.answerId, answerId: payload.bonus.answerId, reveal: payload.bonus.reveal } : {}),
    };
  }
  return view;
}
