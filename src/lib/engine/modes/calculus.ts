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

/**
 * Words a stat label can use without naming its ability ("Cooldown", "Cast Range", "Max Burn Duration"). Anything else in a label
 * is the ability's own vocabulary ("Uppercut Damage", "Beam Length", "Tether Range", "Djinn's ...") and is hidden until the lock
 * is finished: it would tell a player which hero's kit they are reading.
 */
const GENERIC_WORDS = new Set((
  "damage cooldown duration range cast speed per move movement max min minimum maximum health radius slow charges charge time bullet bullets " +
  "second seconds sec resist resistance resists bonus heal healing spirit weapon amp amplification amplified rate lifetime regen regeneration lifesteal " +
  "stack stacks distance delay width length height base full current missing total to for on as vs vs. and of the from before after enemy ally friendly " +
  "hero heroes non-heroes non-hero target targets count amount threshold reduction reduced cost stun buff debuff dps interval window chance hp stamina " +
  "accuracy velocity initial extra additional hold penalty incoming outgoing received taken regenerated restored extended extend headshot melee"
).split(" "));

/** A stat label with the ability-specific words blanked ("Uppercut Damage" -> "▒▒▒▒ Damage"). */
export function censorLabel(label: string): string {
  return label.replace(/[^\s/,]+/g, (word) => (GENERIC_WORDS.has(word.toLowerCase().replace(/[^a-z.-]/g, "")) ? word : "▒▒▒▒"));
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
      // Ability-specific words in the labels stay hidden until the lock is finished; hard mode also leaves one value out.
      stats: a.stats.map((s, i) => {
        const label = done ? s.label : censorLabel(s.label);
        return opts.hard && !done && i === a.omit ? { label, display: null } : { ...s, label };
      }),
    })),
  }),
  displayed: (p) => p.clue.abilities.flatMap((a) => a.stats.flatMap((s) => [s.label, s.display])),
};
