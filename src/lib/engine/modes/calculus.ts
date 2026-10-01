// The Calculus: guess the ability from its numbers, the stats its in-game tooltip lists plus cooldown, cast range,
// duration and charges (normalized from the API at sync; see abilityStats in deadlock/normalize.ts).
import type { AbilityData, GameData } from "../context";
import { slotLabel, type ModeImpl } from "../mode";

/** An ability needs this many stats to be a fair puzzle; fewer (or data synced before stats existed) is not eligible. */
export const CALCULUS_MIN_STATS = 4;
/** Normal mode: the ability's slot joins the clue after this many wrong guesses. */
const SLOT_AFTER = 3;

type Stat = { label: string; display: string };
type CalculusClue = { stats: Stat[]; slot: number; /** Hard mode leaves this stat out until the lock is finished. */ omit: number };

function eligible(data: GameData, a: AbilityData): boolean {
  const h = data.hero(a.heroId);
  return !!h?.eligible && !h.exclude.includes("ability-stats") && !a.exclude.includes("ability-stats") && (a.src.stats?.length ?? 0) >= CALCULUS_MIN_STATS;
}

export const calculus: ModeImpl<CalculusClue> = {
  mode: "ability-stats",
  hard: true,
  candidates: (data) => data.abilities.filter((a) => eligible(data, a)).map((a) => ({ answerId: String(a.id), ref: a.id })),
  build(c, { data, rng }) {
    const a = data.ability(c.ref as number)!;
    const h = data.hero(a.heroId)!;
    const stats = a.src.stats!.map(({ label, display }) => ({ label, display }));
    return {
      v: 1, mode: "ability-stats",
      answer: { id: String(a.id), name: a.name, image: a.icon, sub: h.name, extra: { hero: { name: h.name, image: h.card } } },
      correctIds: [String(a.id)],
      leakTerms: [a.name, ...a.aliases, h.name, ...h.aliases],
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      // Frozen: the stats as they were that day, and which one hard mode omits.
      clue: { stats, slot: a.slot, omit: rng.int(stats.length) },
    };
  },
  clue: (p, wrong, done, opts = {}) => ({
    kind: "stats",
    stats: p.clue.stats.map((s, i) => (opts.hard && !done && i === p.clue.omit ? { label: s.label, display: null } : s)),
    slot: done || (!opts.hard && wrong >= SLOT_AFTER) ? slotLabel(p.clue.slot) : null,
  }),
  displayed: (p) => p.clue.stats.flatMap((s) => [s.label, s.display]),
};
