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

/** Silhouette steps: `normal` zooms out to the whole shape; `hard` stays tight and never shows it all. */
export type SightPayload = {
  normal: string[];
  hard: string[];
  /** Shown once the lock is finished (the coloured cut-out). */
  reveal: string;
  /** Normal mode: after this many wrong guesses the coloured picture itself is shown (The Arsenal); null = never. */
  colourAfter: number | null;
};

async function sightImages(ctx: BuildCtx, tag: string, url: string, normal: number[], hard: number[], origin: { x: number; y: number }) {
  const step = (zoom: number): CropStep => ({ zoom, originX: origin.x, originY: origin.y });
  if (!ctx.images) {
    // Tests: no image store. Production always has one; a missing source skips the candidate instead.
    return { normal: normal.map(() => url), hard: hard.map(() => url), reveal: url };
  }
  const [n, h, reveal] = await Promise.all([
    ctx.images.crops(url, normal.map(step), tag, { silhouette: true }),
    ctx.images.crops(url, hard.map(step), tag, { silhouette: true }),
    ctx.images.copy(url, tag),
  ]);
  if (!n || !h || !reveal) throw new SkipCandidate("no usable cut-out (not a transparent PNG)");
  return { normal: n, hard: h, reveal };
}

function sightClue(p: BasePayload<SightPayload>, wrong: number, done: boolean, hard: boolean): Clue {
  const steps = hard ? p.clue.hard : p.clue.normal;
  const base = { kind: "splash" as const, zoom: 1, originX: 50, originY: 50, steps: steps.length };
  if (done) return { ...base, image: p.clue.reveal, step: steps.length };
  if (!hard && p.clue.colourAfter !== null && wrong >= p.clue.colourAfter) return { ...base, image: p.clue.reveal, step: steps.length };
  const i = Math.min(wrong, steps.length - 1);
  return { ...base, image: steps[i], silhouette: true, step: i + 1 };
}

// ---------- The Shadow (hero silhouette) ----------

const SHADOW_NORMAL = [2.6, 2.1, 1.7, 1.4, 1.15, 1];
const SHADOW_HARD = [4.4, 3.8, 3.3, 2.9, 2.6, 2.4];

export const shadow: ModeImpl<SightPayload> = {
  mode: "silhouette",
  hard: true,
  candidates: (data) => pool(data, "silhouette", (h) => !!h.shadow),
  async build(c, ctx) {
    const h = ctx.data.hero(c.ref as number)!;
    // Portraits have the head in the upper half.
    const origin = { x: Math.round(30 + ctx.rng.next() * 40), y: Math.round(18 + ctx.rng.next() * 30) };
    const imgs = await sightImages(ctx, `${ctx.date}|silhouette`, h.shadow!, SHADOW_NORMAL, SHADOW_HARD, origin);
    return {
      v: 1, mode: "silhouette", answer: heroAnswer(h, h.card), correctIds: [String(h.id)], leakTerms: heroLeak(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { ...imgs, colourAfter: null },
    };
  },
  clue: (p, wrong, done, opts = {}) => sightClue(p, wrong, done, !!opts.hard),
  displayed: () => [],
};

// ---------- The Arsenal (weapon silhouette) ----------

const ARSENAL_NORMAL = [2.4, 1.8, 1.4, 1];
const ARSENAL_HARD = [3.6, 3.1, 2.7, 2.4];
/** Normal mode: the coloured weapon after 4 wrong guesses (the whole silhouette was shown at 3). */
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
    const imgs = await sightImages(ctx, `${ctx.date}|weapon`, h.weapon, ARSENAL_NORMAL, ARSENAL_HARD, origin);
    return {
      v: 1, mode: "weapon", answer: heroAnswer(h, h.card),
      correctIds: [String(h.id)], leakTerms: heroLeak(h),
      hints: {},
      clue: { ...imgs, colourAfter: ARSENAL_COLOUR_AFTER },
    };
  },
  clue: (p, wrong, done, opts = {}) => sightClue(p, wrong, done, !!opts.hard),
  displayed: () => [],
};
