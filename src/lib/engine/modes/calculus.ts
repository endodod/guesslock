// The Calculus: guess the hero from the numbers of their four abilities, the stats each in-game tooltip lists plus
// cooldown, cast range, duration and charges (normalized from the API at sync; see abilityStats in deadlock/normalize.ts).
import type { AbilityData, GameData, HeroData } from "../context";
import { slotLabel, type ModeImpl } from "../mode";

/** Each of the hero's four abilities needs this many stats; fewer (or data synced before stats existed) is not eligible. */
export const CALCULUS_MIN_STATS = 2;

type Stat = { label: string; display: string };
type CalculusClue = {
  /** Slots 1-4 in order. `omit`: the stat hard mode leaves out of that ability until the lock is finished. */
  abilities: { slot: number; stats: Stat[]; omit: number }[];
};

/** The hero's four ability slots, or null when one is missing, turned off or has too few stats. */
function fourAbilities(data: GameData, h: HeroData): AbilityData[] | null {
  if (!h.eligible || h.exclude.includes("ability-stats")) return null;
  const mine = data.abilities.filter((a) => a.heroId === h.id && !a.exclude.includes("ability-stats"));
  const out: AbilityData[] = [];
  for (const slot of [1, 2, 3, 4]) {
    const a = mine.find((x) => x.slot === slot);
    if (!a || (a.src.stats?.length ?? 0) < CALCULUS_MIN_STATS) return null;
    out.push(a);
  }
  return out;
}

export const calculus: ModeImpl<CalculusClue> = {
  mode: "ability-stats",
  hard: true,
  candidates: (data) => data.heroes.filter((h) => fourAbilities(data, h)).map((h) => ({ answerId: String(h.id), ref: h.id })),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const abilities = fourAbilities(data, h)!;
    return {
      v: 1, mode: "ability-stats",
      answer: { id: String(h.id), name: h.name, image: h.card },
      correctIds: [String(h.id)],
      leakTerms: [h.name, ...h.aliases, ...abilities.flatMap((a) => [a.name, ...a.aliases])],
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      // Frozen: the stats as they were that day, and which one per ability hard mode omits.
      clue: {
        abilities: abilities.map((a) => {
          const stats = a.src.stats!.map(({ label, display }) => ({ label, display }));
          return { slot: a.slot, stats, omit: rng.int(stats.length) };
        }),
      },
    };
  },
  clue: (p, _wrong, done, opts = {}) => ({
    kind: "stats",
    abilities: p.clue.abilities.map((a) => ({
      slot: slotLabel(a.slot),
      stats: a.stats.map((s, i) => (opts.hard && !done && i === a.omit ? { label: s.label, display: null } : s)),
    })),
  }),
  displayed: (p) => p.clue.abilities.flatMap((a) => a.stats.flatMap((s) => [s.label, s.display])),
};
