// Mode contract. Each mode picks candidates, freezes a payload snapshot, and renders the clue
// for a given number of wrong guesses. Win/loss/hints/bonus are handled generically in play.ts.
import type { Rng } from "../rng";
import type { GameData } from "./context";
import type { AnswerView, Clue, GuessRow, Tile } from "./types";
import type { HeroItemStats } from "../deadlock/api";
import type { ClueImages } from "../image/clue";

export type Candidate = { answerId: string; ref: number | string };

export type HintValue = { value?: string; image?: string; audio?: string; gainDb?: number; label?: string };

/** Everything stored in DailyPuzzle.payload. Mode-specific data goes in `clue`. */
export type BasePayload<C = unknown> = {
  v: 1;
  mode: string;
  /** What the no-repeat window keys on when the mode picks its own answer in build() (The Cache: "match:team"). */
  key?: string;
  answer: AnswerView;
  /** Guess ids that count as correct (multiple for The Lineage). */
  correctIds: string[];
  /** Names/aliases that must never appear in displayed text (leak validation). */
  leakTerms: string[];
  hints: Record<string, HintValue>;
  bonus?: {
    prompt: string; options: { id: string; name: string }[]; answerId: string;
    /** Revealed only after the bonus pick (or on a loss), never before. */
    reveal?: { name: string; image: string | null };
  };
  clue: C;
};

export type BuildCtx = {
  data: GameData;
  rng: Rng;
  /** The puzzle day (YYYY-MM-DD), or "endless:<token>" for a practice puzzle. Also tags its clue images. */
  date: string;
  dayIndex: number;
  analytics: () => Promise<HeroItemStats>;
  /** Most played ability point order of a hero (The Belongings). Optional: absent in tests. */
  abilityOrder?: (heroId: number) => Promise<number[] | null>;
  /** Server-side clue images (src/lib/image/clue.ts). Absent in tests: modes then fall back to the plain URL. */
  images?: ClueImages;
  /** Ready Omen match timelines (The Cache). Absent in tests and when none are harvested. */
  matches?: () => Promise<import("../omens/types").MatchTimeline[]>;
  /** The minimap as a /media URL (The Wayfinder). Absent in tests. */
  mapImage?: string | null;
  /** Approved, complete Séance hero groups (The Constellation). Absent in tests. */
  heroCategories?: () => Promise<{ key: string; label: string; info: string; members: number[] }[]>;
  /** Answer ids used in the no-repeat window (for modes that pick their answer in build()). */
  recent?: string[];
};

/** How a clue is rendered for one player: hard mode is chosen per lock before the first guess. */
export type ClueOpts = { hard?: boolean };

/** A board mode's verdict on one guess (The Cache, The Constellation): null = not a valid move (ignored, nothing is lost). */
export type Judged = { row: GuessRow; wrong: boolean } | { rejected: string };

/** The whole mode is unavailable for the day (e.g. no analytics): the lock is sealed. */
export class SealedError extends Error {}
/** This candidate cannot be built (e.g. too little data); the engine tries the next one. */
export class SkipCandidate extends Error {}

export interface ModeImpl<C = unknown> {
  mode: string;
  candidates(data: GameData, ctx: { dayIndex: number }): Candidate[];
  build(c: Candidate, ctx: BuildCtx): Promise<BasePayload<C>> | BasePayload<C>;
  /** Clue as shown after `wrong` wrong guesses. `done` = puzzle finished (full reveal allowed). */
  clue(payload: BasePayload<C>, wrong: number, done: boolean, opts?: ClueOpts, rows?: GuessRow[]): Clue;
  /**
   * Board modes judge each guess themselves instead of comparing it with `correctIds` (rows so far are passed in, so a
   * mode can refuse a duplicate). `solved` decides the win; `souls` the score (default: soulsFor).
   */
  judge?(payload: BasePayload<C>, guess: string, rows: GuessRow[], opts: ClueOpts): Judged;
  solved?(payload: BasePayload<C>, rows: GuessRow[]): boolean;
  souls?(payload: BasePayload<C>, r: { won: boolean; rows: GuessRow[]; wrong: number; hintsUsed: number }): number;
  /** The mode has a hard variant (BasePayload is the same; only the rendering changes). */
  hard?: boolean;
  /** Attribute tiles for a guessed id (grid modes only). */
  tiles?(payload: BasePayload<C>, guessId: string, opts?: ClueOpts): Tile[] | null;
  /** Text shown to the player at maximum reveal, for leak validation. */
  displayed(payload: BasePayload<C>): string[];
  /** Audio URLs the player can receive (leak validation: all must be opaque /media/<sha1> URLs). */
  audio?(payload: BasePayload<C>): string[];
}

/** Hard mode of the attribute grids: these column indices show "?" (two of them, fixed per puzzle; none with < 4 columns). */
export function hardHiddenColumns(columns: number, answerId: string): number[] {
  if (columns < 4) return [];
  const h = [...answerId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const a = h % columns;
  const b = (a + 1 + ((h >>> 8) % (columns - 1))) % columns;
  return [a, b];
}

export function slotLabel(slot: number): string {
  return slot === 4 ? "Ultimate" : `Ability ${slot}`;
}

export function cap(s: string | null | undefined): string {
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}
