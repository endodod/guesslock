// Mode contract. Each mode picks candidates, freezes a payload snapshot, and renders the clue
// for a given number of wrong guesses. Win/loss/hints/bonus are handled generically in play.ts.
import type { Rng } from "../rng";
import type { GameData } from "./context";
import type { AnswerView, Clue, Tile } from "./types";
import type { HeroItemStats } from "../deadlock/api";

export type Candidate = { answerId: string; ref: number | string };

export type HintValue = { value?: string; image?: string; audio?: string; label?: string };

/** Everything stored in DailyPuzzle.payload. Mode-specific data goes in `clue`. */
export type BasePayload<C = unknown> = {
  v: 1;
  mode: string;
  answer: AnswerView;
  /** Guess ids that count as correct (multiple for The Lineage). */
  correctIds: string[];
  /** Names/aliases that must never appear in displayed text (leak validation). */
  leakTerms: string[];
  hints: Record<string, HintValue>;
  bonus?: { prompt: string; options: { id: string; name: string }[]; answerId: string };
  clue: C;
};

export type BuildCtx = {
  data: GameData;
  rng: Rng;
  date: string;
  dayIndex: number;
  analytics: () => Promise<HeroItemStats>;
};

/** The whole mode is unavailable for the day (e.g. no analytics): the lock is sealed. */
export class SealedError extends Error {}
/** This candidate cannot be built (e.g. too little data); the engine tries the next one. */
export class SkipCandidate extends Error {}

export interface ModeImpl<C = unknown> {
  mode: string;
  candidates(data: GameData, ctx: { dayIndex: number }): Candidate[];
  build(c: Candidate, ctx: BuildCtx): Promise<BasePayload<C>> | BasePayload<C>;
  /** Clue as shown after `wrong` wrong guesses. `done` = puzzle finished (full reveal allowed). */
  clue(payload: BasePayload<C>, wrong: number, done: boolean): Clue;
  /** Attribute tiles for a guessed id (grid modes only). */
  tiles?(payload: BasePayload<C>, guessId: string): Tile[] | null;
  /** Text shown to the player at maximum reveal, for leak validation. */
  displayed(payload: BasePayload<C>): string[];
}

export function slotLabel(slot: number): string {
  return slot === 4 ? "Ultimate" : `Ability ${slot}`;
}

export function cap(s: string | null | undefined): string {
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}
