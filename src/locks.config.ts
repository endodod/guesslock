// Single source of truth for lock numbering, names, order and per-mode rules.
// Local player data is keyed by `slug`, never by numeral, so renumbering is safe.

export type LockGroup = "spirits" | "shop" | "omens" | "seance";
export type GuessKind = "hero" | "ability" | "item" | "number" | "omen" | "seance";
/** The Séance's four tables: which category types a table draws from (see src/lib/seance/). */
export type SeanceTable = "mechanics" | "visuals" | "lore" | "mixed";

export type HintDef = {
  id: string;
  label: string;
  /** Unlocks once this many wrong guesses have been made. */
  after: number;
};

export type LockDef = {
  slug: string;
  mode: string; // internal mode id used by the engine
  numeral: string;
  name: string;
  subtitle: string;
  group: LockGroup;
  guess: GuessKind;
  /** Number of lockpicks shown. For modes with a try limit, it equals the limit. */
  picks: number;
  /** Hard try limit (loss state). Only The Measure has one. */
  maxTries?: number;
  hints: HintDef[];
  /** Attribute-grid modes get a tile-grid share option. */
  attributeGrid?: boolean;
  bonusRound?: boolean;
  /** No-repeat window override (days). Default: min(60, poolSize * 0.6). */
  noRepeatDays?: number;
  /**
   * Internal locks that share one Vault box (The Séance: four tables). The Vault renders them as a
   * single box that counts as one lock, and the lock screen shows them as tabs.
   */
  box?: "seance";
  /** The Séance: this lock's table. */
  table?: { kind: SeanceTable; label: string };
};

export const LOCKS: LockDef[] = [
  {
    slug: "reckoning", mode: "classic", numeral: "I", name: "The Reckoning",
    subtitle: "Guess the hero by attributes", group: "spirits", guess: "hero", picks: 6,
    attributeGrid: true,
    hints: [
      { id: "archetype", label: "Archetype", after: 4 },
      { id: "initial", label: "First letter", after: 6 },
    ],
  },
  {
    slug: "visage", mode: "splash", numeral: "II", name: "The Visage",
    subtitle: "Guess the hero from their portrait", group: "spirits", guess: "hero", picks: 6,
    hints: [
      { id: "gender", label: "Gender", after: 4 },
      { id: "archetype", label: "Archetype", after: 6 },
    ],
  },
  {
    slug: "sigil", mode: "ability-icon", numeral: "III", name: "The Sigil",
    subtitle: "Guess the hero from an ability icon", group: "spirits", guess: "hero", picks: 6,
    bonusRound: true,
    hints: [
      { id: "slot", label: "Ability slot", after: 4 },
      { id: "archetype", label: "Archetype", after: 6 },
    ],
  },
  {
    slug: "testament", mode: "lore", numeral: "IV", name: "The Testament",
    subtitle: "Guess the hero from their lore", group: "spirits", guess: "hero", picks: 7,
    hints: [
      { id: "gender", label: "Gender", after: 4 },
      { id: "species", label: "Species", after: 7 },
    ],
  },
  {
    slug: "incantation", mode: "ability-desc", numeral: "V", name: "The Incantation",
    subtitle: "Guess the hero from an ability description", group: "spirits", guess: "hero", picks: 6,
    bonusRound: true,
    hints: [
      { id: "slot", label: "Ability slot", after: 3 },
      { id: "icon", label: "Blurred ability icon", after: 6 },
    ],
  },
  {
    slug: "belongings", mode: "whose-build", numeral: "VI", name: "The Belongings",
    subtitle: "Guess the hero from their build", group: "spirits", guess: "hero", picks: 7,
    hints: [
      { id: "archetype", label: "Archetype", after: 5 },
      { id: "weapon", label: "Weapon type", after: 7 },
    ],
  },
  {
    slug: "ascension", mode: "upgrades", numeral: "VII", name: "The Ascension",
    subtitle: "Guess the ability from its upgrades", group: "spirits", guess: "ability", picks: 6,
    hints: [
      { id: "archetype", label: "Hero archetype", after: 4 },
      { id: "initial", label: "Hero's first letter", after: 6 },
    ],
  },
  {
    slug: "cipher", mode: "emoji", numeral: "VIII", name: "The Cipher",
    subtitle: "Guess the hero from emojis", group: "spirits", guess: "hero", picks: 9,
    hints: [
      { id: "gender", label: "Gender", after: 7 },
      { id: "initial", label: "First letter", after: 9 },
    ],
  },
  {
    slug: "echo", mode: "quote", numeral: "IX", name: "The Echo",
    subtitle: "Guess the hero from a voice line", group: "spirits", guess: "hero", picks: 6,
    // Voice lines are text-only for now, so the hint is the gender.
    // Once audio exists, the payload relabels this hint "Voice clip".
    hints: [{ id: "audio", label: "Gender", after: 6 }],
  },
  {
    slug: "relic", mode: "item-picture", numeral: "X", name: "The Relic",
    subtitle: "Guess the item from its icon", group: "shop", guess: "item", picks: 6,
    hints: [
      { id: "slot", label: "Slot", after: 4 },
      { id: "tier", label: "Tier", after: 6 },
    ],
  },
  {
    slug: "appraisal", mode: "item-classic", numeral: "XI", name: "The Appraisal",
    subtitle: "Guess the item by attributes", group: "shop", guess: "item", picks: 6,
    attributeGrid: true,
    hints: [
      { id: "initial", label: "First letter", after: 5 },
    ],
  },
  {
    slug: "lineage", mode: "build-path", numeral: "XII", name: "The Lineage",
    subtitle: "Guess what builds into what", group: "shop", guess: "item", picks: 6,
    noRepeatDays: 10,
    hints: [{ id: "tier", label: "Tier", after: 3 }],
  },
  {
    slug: "measure", mode: "stat-bonus", numeral: "XIII", name: "The Measure",
    subtitle: "Guess the item's hidden stat value", group: "shop", guess: "number", picks: 5,
    maxTries: 5,
    hints: [],
  },
  // The Omens: predict what happens next from a frozen moment of a real high-rank match.
  // No guesses or win/loss: one lock-in, scored out of 100 souls (src/lib/omens/scoring.ts).
  {
    slug: "clash", mode: "omen-clash", numeral: "XIV", name: "The Clash",
    subtitle: "Predict the teamfight", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  {
    slug: "beast", mode: "omen-beast", numeral: "XV", name: "The Beast",
    subtitle: "Predict the midboss", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  {
    slug: "rift", mode: "omen-rift", numeral: "XVI", name: "The Rift",
    subtitle: "Predict the Unstable Rift", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  // The Séance: 16 heroes, 4 hidden groups of 4. Four tables a day, each its own frozen puzzle,
  // sharing one Vault box. 4 mistakes lose a table (src/lib/seance/play.ts).
  ...(
    [["mechanics", "Mechanics"], ["visuals", "Visuals"], ["lore", "Lore"], ["mixed", "Mixed"]] as const
  ).map(([kind, label]): LockDef => ({
    slug: `seance-${kind}`, mode: "seance", numeral: "XVII", name: "The Séance",
    subtitle: "Sort 16 heroes into 4 hidden groups.", group: "seance", guess: "seance", picks: 4, maxTries: 4,
    box: "seance", table: { kind, label },
    hints: [{ id: "category", label: "Reveal a category name", after: 2 }],
  })),
];

export const LOCK_BY_SLUG: Record<string, LockDef> = Object.fromEntries(LOCKS.map((l) => [l.slug, l]));

export function getLock(slug: string): LockDef | undefined {
  return LOCK_BY_SLUG[slug];
}

export const SPIRIT_LOCKS = LOCKS.filter((l) => l.group === "spirits");
export const SHOP_LOCKS = LOCKS.filter((l) => l.group === "shop");
export const OMEN_LOCKS = LOCKS.filter((l) => l.group === "omens");
export const SEANCE_LOCKS = LOCKS.filter((l) => l.box === "seance");
/** Slug -> Omen kind. */
export const omenOf = (l: LockDef) => (l.group === "omens" ? (l.slug as "clash" | "beast" | "rift") : null);
export const isSeance = (slug: string) => LOCK_BY_SLUG[slug]?.box === "seance";

/** The Séance box as the Vault shows it (one box, one numeral, counts as one lock). */
export const SEANCE_BOX = { slug: "seance", numeral: "XVII", name: "The Séance", subtitle: "Sort 16 heroes into 4 hidden groups." };

/**
 * What the Vault counts as "a lock": every lock on its own, except the Séance tables, which fold
 * into one box. Used for "x / N locks open", the daily share and per-day summaries.
 */
export type VaultUnit = { kind: "lock"; lock: LockDef } | { kind: "seance"; locks: LockDef[] };
export const VAULT_UNITS: VaultUnit[] = [
  ...LOCKS.filter((l) => !l.box).map((lock) => ({ kind: "lock" as const, lock })),
  { kind: "seance", locks: SEANCE_LOCKS },
];

/** Old 11-lock numbering (before The Cipher and The Echo), for migrating legacy local data. */
export const LEGACY_11_NUMERALS: Record<string, string> = {
  I: "reckoning", II: "visage", III: "sigil", IV: "testament", V: "incantation",
  VI: "belongings", VII: "ascension", VIII: "relic", IX: "appraisal", X: "lineage", XI: "measure",
};
