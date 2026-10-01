// The Wayfinder: where am I? A zoomed piece of the minimap around the spot where a real hero stood at a moment of a
// harvested high-rank match (the Omens harvest). Pin the spot on the full map. Each miss zooms out and adds game context
// (the clock, then what the hero was doing). The map is point-symmetric, so the mirrored spot counts as well.
import { SealedError, SkipCandidate, type ModeImpl } from "../mode";
import { toMap } from "../../omens/ingest";
import type { MatchTimeline } from "../../omens/types";

const STEPS = [5, 3.5, 2.5];
const HARD_STEPS = [7, 6, 5];
/** A pin within this share of the map's width of the spot (or its mirror) opens the lock. */
export const WAYFINDER_RADIUS = 0.05;
const SOULS = [100, 70, 40];
/** A jammed lock still earns up to this much for the closest pin (nothing beyond 30% of the map away). */
const NEAR_MISS_MAX = 25;

type Spot = { x: number; y: number };
type WayfinderClue = {
  spot: Spot;
  normal: string[]; hard: string[];
  map: string;
  context: { time: string; doing: string };
};

const COMBAT = ["moving around", "fighting enemy heroes", "pushing enemy troopers", "farming a neutral camp"];

/** Distance (share of the map width) to the spot or its mirror, whichever is closer. */
export function spotDistance(spot: Spot, pin: Spot): number {
  return Math.min(Math.hypot(pin.x - spot.x, pin.y - spot.y), Math.hypot(pin.x - (1 - spot.x), pin.y - (1 - spot.y)));
}

/** Compass direction from a pin to the nearer of the spot and its mirror. */
function direction(spot: Spot, pin: Spot): string {
  const mirror = { x: 1 - spot.x, y: 1 - spot.y };
  const t = Math.hypot(pin.x - spot.x, pin.y - spot.y) <= Math.hypot(pin.x - mirror.x, pin.y - mirror.y) ? spot : mirror;
  const a = (Math.atan2(-(t.y - pin.y), t.x - pin.x) * 180) / Math.PI; // 0 = east, 90 = north
  return ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"][Math.round(((a + 360) % 360) / 45) % 8];
}

/** A moment worth asking about: alive, on the map, not standing in the spawn at the start. */
export function pickSpot(timelines: MatchTimeline[], rng: { pick<T>(a: readonly T[]): T; int(n: number): number }) {
  for (let tries = 0; tries < 50; tries++) {
    const tl = rng.pick(timelines);
    const p = rng.pick(tl.players);
    const lo = 300, hi = Math.min(tl.duration - 30, p.x.length - 1);
    if (hi <= lo) continue;
    const t = lo + rng.int(hi - lo);
    if (p.respawnAt[t] > 0 || p.hp[t] <= 0) continue;
    const [x, y] = toMap(p.x[t], p.y[t]);
    if (!(x > 0.05 && x < 0.95 && y > 0.03 && y < 0.97)) continue;
    return { tl, x, y, t, combat: p.combat[t] ?? 0 };
  }
  return null;
}

/** CSS-style crop origin (%) that centres a zoom-z window on c (0..1). */
const originFor = (c: number, z: number) => Math.round(Math.min(100, Math.max(0, ((c * 100 - 50 / z) / (1 - 1 / z)))));

export const wayfinder: ModeImpl<WayfinderClue> = {
  mode: "wayfinder",
  hard: true,
  candidates: () => [{ answerId: "spot", ref: 0 }],
  async build(_c, { rng, matches, images, mapImage, date }) {
    const timelines = (await matches?.()) ?? [];
    if (!timelines.length) throw new SealedError("no harvested match yet");
    if (!mapImage) throw new SealedError("no minimap");
    const s = pickSpot(timelines, rng);
    if (!s) throw new SkipCandidate("no usable moment");
    const step = (zoom: number) => ({ zoom, originX: originFor(s.x, zoom), originY: originFor(s.y, zoom) });
    const tag = `${date}|wayfinder`;
    const [normal, hard] = images
      ? await Promise.all([images.crops(mapImage, STEPS.map(step), tag), images.crops(mapImage, HARD_STEPS.map(step), tag)])
      : [STEPS.map(() => mapImage), HARD_STEPS.map(() => mapImage)];
    if (!normal || !hard) throw new SkipCandidate("minimap can't be cropped");
    const time = `${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, "0")}`;
    return {
      v: 1, mode: "wayfinder", key: `${s.tl.matchId}:${s.t}`,
      answer: { id: "spot", name: `Match ${s.tl.matchId} at ${time}`, image: null },
      correctIds: [], leakTerms: [], hints: {},
      clue: { spot: { x: s.x, y: s.y }, normal, hard, map: mapImage, context: { time, doing: COMBAT[s.combat] ?? COMBAT[0] } },
    };
  },
  clue: (p, wrong, done, opts = {}, rows = []) => {
    const steps = opts.hard ? p.clue.hard : p.clue.normal;
    const i = done ? steps.length - 1 : Math.min(wrong, steps.length - 1);
    return {
      kind: "map",
      crop: steps[i], step: i + 1, steps: steps.length,
      map: p.clue.map,
      pins: rows.map((r) => {
        const [x, y] = r.id.split(",").map((n) => Number(n) / 1000);
        return { x, y, correct: r.correct };
      }),
      context: opts.hard && !done ? {} : { ...(done || wrong >= 1 ? { time: p.clue.context.time } : {}), ...(done || wrong >= 2 ? { doing: p.clue.context.doing } : {}) },
      ...(done ? { answer: [p.clue.spot, { x: 1 - p.clue.spot.x, y: 1 - p.clue.spot.y }] } : {}),
    };
  },
  // Guess: "x,y" in thousandths of the map (0-1000).
  judge(p, guess) {
    const m = /^(\d{1,4}),(\d{1,4})$/.exec(guess);
    if (!m) return { rejected: "Place a pin on the map." };
    const pin = { x: Math.min(1000, Number(m[1])) / 1000, y: Math.min(1000, Number(m[2])) / 1000 };
    const d = spotDistance(p.clue.spot, pin);
    const correct = d <= WAYFINDER_RADIUS;
    const name = correct ? "Right there" : `${Math.round(d * 100)}% of the map away, to the ${direction(p.clue.spot, pin)}`;
    return { row: { id: `${Math.round(pin.x * 1000)},${Math.round(pin.y * 1000)}`, name, icon: null, correct }, wrong: !correct };
  },
  solved: (_p, rows) => rows.some((r) => r.correct),
  souls: (p, r) => {
    if (r.won) return SOULS[Math.min(r.wrong, SOULS.length - 1)];
    const best = Math.min(...r.rows.map((row) => {
      const [x, y] = row.id.split(",").map((n) => Number(n) / 1000);
      return spotDistance(p.clue.spot, { x, y });
    }));
    return Math.max(0, Math.round(NEAR_MISS_MAX * (1 - best / 0.3)));
  },
  displayed: (p) => [p.clue.context.time, p.clue.context.doing],
};
