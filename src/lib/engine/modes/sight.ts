// Picture modes rendered on the server (src/lib/image/clue.ts): The Shadow (hero silhouette) and The Arsenal (weapon
// silhouette). Every reveal step is its own salted image, so the browser never holds more than the step shows, and the
// coloured picture is only sent once the lock is finished.
import type { GameData, HeroData } from "../context";
import { SkipCandidate, SealedError, type BasePayload, type BuildCtx, type Candidate, type ModeImpl } from "../mode";
import type { CropStep } from "../../image/clue";
import type { Clue } from "../types";

export const heroLeak = (h: HeroData) => [h.name, ...h.aliases];
const heroAnswer = (h: HeroData, image: string | null) => ({ id: String(h.id), name: h.name, image });

function pool(data: GameData, mode: string, has: (h: HeroData) => boolean): Candidate[] {
  return data.heroes.filter((h) => h.eligible && !h.exclude.includes(mode) && has(h)).map((h) => ({ answerId: String(h.id), ref: h.id }));
}

/**
 * Silhouette steps: `normal` shows the whole shape from the start. Hard mode shows the same silhouette turned (a quarter, half
 * or three quarters, fixed per puzzle) and turns it back a little with every wrong guess, upright only once the lock is finished.
 * (`hard`: tight zoom-out crops of puzzles built before that; no longer used.)
 */
export type SightPayload = {
  normal: string[];
  hard?: string[];
  /** Shown once the lock is finished (the coloured cut-out). */
  reveal: string;
  /** Normal mode: after this many wrong guesses the coloured picture itself is shown (The Arsenal); null = never. */
  colourAfter: number | null;
};

async function sightImages(ctx: BuildCtx, tag: string, url: string, normal: number[], origin: { x: number; y: number }) {
  const step = (zoom: number): CropStep => ({ zoom, originX: origin.x, originY: origin.y });
  if (!ctx.images) {
    // Tests: no image store. Production always has one; a missing source skips the candidate instead.
    return { normal: normal.map(() => url), reveal: url };
  }
  const [n, reveal] = await Promise.all([ctx.images.crops(url, normal.map(step), tag, { silhouette: true }), ctx.images.copy(url, tag)]);
  if (!n || !reveal) throw new SkipCandidate("no usable cut-out (not a transparent PNG)");
  return { normal: n, reveal };
}

/** The turn a hard silhouette starts at (a quarter, half or three quarters, fixed per puzzle). */
const startAngle = (answerId: string) => 90 * (1 + ([...answerId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 3));

function sightClue(p: BasePayload<SightPayload>, wrong: number, done: boolean, hard: boolean, hardSteps: number): Clue {
  const steps = hard ? hardSteps : p.clue.normal.length;
  const base = { kind: "splash" as const, zoom: 1, originX: 50, originY: 50, steps };
  if (done) return { ...base, image: p.clue.reveal, step: steps };
  if (!hard && p.clue.colourAfter !== null && wrong >= p.clue.colourAfter) return { ...base, image: p.clue.reveal, step: steps };
  if (hard) {
    // The same whole silhouette, turned back by an equal share of its start angle with each wrong guess, never fully upright.
    const i = Math.min(wrong, hardSteps - 1);
    return { ...base, image: p.clue.normal[0], silhouette: true, step: i + 1, rotate: Math.round(startAngle(p.correctIds[0]) * (1 - i / hardSteps)) };
  }
  const i = Math.min(wrong, steps - 1);
  return { ...base, image: p.clue.normal[i], silhouette: true, step: i + 1 };
}

// ---------- The Shadow (hero silhouette) ----------

const SHADOW_NORMAL = [1];
/** Hard mode turns back in this many steps. */
const SHADOW_HARD_STEPS = 6;

export const shadow: ModeImpl<SightPayload> = {
  mode: "silhouette",
  hard: true,
  candidates: (data) => pool(data, "silhouette", (h) => !!h.shadow),
  async build(c, ctx) {
    const h = ctx.data.hero(c.ref as number)!;
    // Portraits have the head in the upper half.
    const origin = { x: Math.round(30 + ctx.rng.next() * 40), y: Math.round(18 + ctx.rng.next() * 30) };
    const imgs = await sightImages(ctx, `${ctx.date}|silhouette`, h.shadow!, SHADOW_NORMAL, origin);
    return {
      v: 1, mode: "silhouette", answer: heroAnswer(h, h.card), correctIds: [String(h.id)], leakTerms: heroLeak(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { ...imgs, colourAfter: null },
    };
  },
  clue: (p, wrong, done, opts = {}) => sightClue(p, wrong, done, !!opts.hard, SHADOW_HARD_STEPS),
  displayed: () => [],
};

// ---------- The Arsenal (weapon silhouette) ----------

const ARSENAL_NORMAL = [1];
const ARSENAL_HARD_STEPS = 4;
/** Normal mode: the coloured weapon after 4 wrong guesses (the whole silhouette is shown from the start). */
const ARSENAL_COLOUR_AFTER = 4;

export const arsenal: ModeImpl<SightPayload> = {
  mode: "weapon",
  hard: true,
  // The API has no weapon art: only heroes with a curated cut-out (admin setup) can be the answer. None = sealed.
  candidates: (data) => pool(data, "weapon", (h) => !!h.weapon),
  async build(c, ctx) {
    const h = ctx.data.hero(c.ref as number)!;
    if (!h.weapon) throw new SealedError("no weapon art curated yet");
    const origin = { x: Math.round(25 + ctx.rng.next() * 50), y: Math.round(30 + ctx.rng.next() * 40) };
    const imgs = await sightImages(ctx, `${ctx.date}|weapon`, h.weapon, ARSENAL_NORMAL, origin);
    return {
      v: 1, mode: "weapon", answer: heroAnswer(h, h.card),
      correctIds: [String(h.id)], leakTerms: heroLeak(h),
      hints: {},
      clue: { ...imgs, colourAfter: ARSENAL_COLOUR_AFTER },
    };
  },
  clue: (p, wrong, done, opts = {}) => sightClue(p, wrong, done, !!opts.hard, ARSENAL_HARD_STEPS),
  displayed: () => [],
};
