// Single source of truth for lock numbering, names, order and per-mode rules.
// Local player data is keyed by `slug`, never by numeral, so renumbering is safe.

export type LockGroup = "spirits" | "shop" | "omens" | "seance" | "stars";
/** `match`: a full assignment (The Cache); `grid`: a cell and a typed name (The Constellation). */
export type GuessKind = "hero" | "ability" | "item" | "number" | "omen" | "seance" | "match" | "grid";
/** The Séance family: sort 16 entities into 4 hidden groups. One box per entity, four tables a day each. */
export type SeanceBoxId = "seance" | "bazaar" | "grimoire";
export type SeanceEntity = "hero" | "item" | "ability";
/** A table: which category types it draws from ("mixed" = at least 3 different types). */
export type SeanceTable = "mechanics" | "visuals" | "lore" | "stats" | "effects" | "mixed";

export type HintDef = {
  id: string;
  label: string;
  /** Unlocks once this many wrong guesses have been made. */
  after: number;
};

/**
 * Every guessing lock uses the same two hints: the answer's first letter, then its first two letters.
 * Anything else a player might want to know belongs in the attribute categories or is its own lock.
 */
export function LETTER_HINTS(first: number, second: number): HintDef[] {
  return [
    { id: "initial", label: "First letter", after: first },
    { id: "initial2", label: "First two letters", after: second },
  ];
}

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
  /** Needs audio to play: hidden by the "Skip sound locks" setting (never counts then). */
  needsAudio?: boolean;
  /**
   * Internal locks that share one Vault box (The Séance: four tables). The Vault renders them as a
   * single box that counts as one lock, and the lock screen shows them as tabs.
   */
  box?: SeanceBoxId;
  /** The Séance: this lock's table. */
  table?: { kind: SeanceTable; label: string };
  /** How guesses are entered when it isn't the search box: one of the clue's items (The Decoy). */
  input?: "choice";
  /** Has a hard variant (the player picks it before the first guess; worth 1.5x souls). */
  hard?: boolean;
};

export type SeanceBoxDef = {
  id: SeanceBoxId; entity: SeanceEntity; numeral: string; name: string; subtitle: string;
  /** What the tiles are called ("heroes", "items", "abilities"). */
  noun: string;
  tables: readonly (readonly [SeanceTable, string])[];
};

export const SEANCE_BOX_LIST: SeanceBoxDef[] = [
  {
    id: "seance", entity: "hero", numeral: "XX", name: "The Séance", subtitle: "Sort 16 heroes into 4 hidden groups.", noun: "heroes",
    tables: [["mechanics", "Mechanics"], ["visuals", "Visuals"], ["lore", "Lore"], ["mixed", "Mixed"]],
  },
  {
    id: "bazaar", entity: "item", numeral: "XXI", name: "The Bazaar", subtitle: "Sort 16 items into 4 hidden groups.", noun: "items",
    tables: [["stats", "Stats"], ["effects", "Effects"], ["visuals", "Looks"], ["mixed", "Mixed"]],
  },
  {
    id: "grimoire", entity: "ability", numeral: "XXII", name: "The Grimoire", subtitle: "Sort 16 abilities into 4 hidden groups.", noun: "abilities",
    tables: [["mechanics", "Mechanics"], ["effects", "Effects"], ["visuals", "Looks"], ["mixed", "Mixed"]],
  },
];
export const SEANCE_BOXES: Record<SeanceBoxId, SeanceBoxDef> = Object.fromEntries(SEANCE_BOX_LIST.map((b) => [b.id, b])) as Record<SeanceBoxId, SeanceBoxDef>;

export const LOCKS: LockDef[] = [
  {
    slug: "reckoning", mode: "classic", numeral: "I", name: "The Reckoning",
    subtitle: "Guess the hero by attributes", group: "spirits", guess: "hero", picks: 6, hard: true,
    attributeGrid: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "visage", mode: "splash", numeral: "II", name: "The Visage",
    subtitle: "Guess the hero from their portrait", group: "spirits", guess: "hero", picks: 6, hard: true,
    hints: [],
  },
  {
    slug: "sigil", mode: "ability-icon", numeral: "III", name: "The Sigil",
    subtitle: "Guess the hero from an ability icon", group: "spirits", guess: "hero", picks: 6, hard: true,
    bonusRound: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "testament", mode: "lore", numeral: "IV", name: "The Testament",
    subtitle: "Guess the hero from their lore", group: "spirits", guess: "hero", picks: 7,
    hints: LETTER_HINTS(4, 7),
  },
  {
    slug: "incantation", mode: "ability-desc", numeral: "V", name: "The Incantation",
    subtitle: "Guess the hero from an ability description", group: "spirits", guess: "hero", picks: 6,
    bonusRound: true,
    hints: LETTER_HINTS(3, 6),
  },
  {
    slug: "belongings", mode: "whose-build", numeral: "VI", name: "The Belongings",
    subtitle: "Guess the hero from their build", group: "spirits", guess: "hero", picks: 7, hard: true,
    hints: LETTER_HINTS(5, 7),
  },
  {
    slug: "ascension", mode: "upgrades", numeral: "VII", name: "The Ascension",
    subtitle: "Guess the ability from its upgrades", group: "spirits", guess: "ability", picks: 6,
    bonusRound: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "cipher", mode: "emoji", numeral: "VIII", name: "The Cipher",
    subtitle: "Guess the hero from emojis", group: "spirits", guess: "hero", picks: 8,
    // 5 emojis per puzzle: all shown after 4 wrong guesses.
    hints: LETTER_HINTS(6, 8),
  },
  {
    slug: "echo", mode: "quote", numeral: "IX", name: "The Echo",
    subtitle: "Guess the hero from their select lines", group: "spirits", guess: "hero", picks: 6,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "utterance", mode: "quote-cast", numeral: "X", name: "The Utterance",
    subtitle: "Guess the hero from what they say casting an ability", group: "spirits", guess: "hero", picks: 6,
    bonusRound: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "colloquy", mode: "quote-convo", numeral: "XI", name: "The Colloquy",
    subtitle: "Guess the hero from a conversation", group: "spirits", guess: "hero", picks: 6,
    hints: LETTER_HINTS(3, 5),
  },
  {
    slug: "resonance", mode: "hero-sound", numeral: "XII", name: "The Resonance",
    subtitle: "Guess the hero from an ability cast sound", group: "spirits", guess: "hero", picks: 6,
    bonusRound: true, needsAudio: true,
    // Wrong guesses unlock more sound (clear clip, then more cast variants; see the mode). Hints are the shared letter hints.
    hints: LETTER_HINTS(4, 6),
  },
  // Added after the Séance family (numerals XXIII+ so the existing ones never change), shown with their groups.
  {
    slug: "shadow", mode: "silhouette", numeral: "XXIII", name: "The Shadow",
    subtitle: "Guess the hero from their silhouette", group: "spirits", guess: "hero", picks: 6, hard: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "arsenal", mode: "weapon", numeral: "XXIV", name: "The Arsenal",
    subtitle: "Guess the hero from their weapon", group: "spirits", guess: "hero", picks: 6, hard: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "calculus", mode: "ability-stats", numeral: "XXV", name: "The Calculus",
    subtitle: "Guess the hero from their abilities' stats", group: "spirits", guess: "hero", picks: 6, hard: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "relic", mode: "item-picture", numeral: "XIII", name: "The Relic",
    subtitle: "Guess the item from its icon", group: "shop", guess: "item", picks: 6, hard: true,
    bonusRound: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "appraisal", mode: "item-classic", numeral: "XIV", name: "The Appraisal",
    subtitle: "Guess the item by attributes", group: "shop", guess: "item", picks: 6, hard: true,
    bonusRound: true,
    attributeGrid: true,
    hints: LETTER_HINTS(4, 6),
  },
  {
    slug: "lineage", mode: "build-path", numeral: "XV", name: "The Lineage",
    subtitle: "Guess what builds into what", group: "shop", guess: "item", picks: 6,
    bonusRound: true,
    noRepeatDays: 10,
    hints: LETTER_HINTS(3, 5),
  },
  {
    slug: "measure", mode: "stat-bonus", numeral: "XVI", name: "The Measure",
    subtitle: "Guess the item's hidden stat value", group: "shop", guess: "number", picks: 5, hard: true,
    maxTries: 5,
    hints: [],
  },
  {
    slug: "decoy", mode: "decoy", numeral: "XXVI", name: "The Decoy",
    subtitle: "Spot the fake item in a hero's build", group: "shop", guess: "item", picks: 3, maxTries: 3,
    input: "choice", hard: true, noRepeatDays: 20, hints: [],
  },
  {
    slug: "cache", mode: "cache", numeral: "XXVII", name: "The Cache",
    subtitle: "Match a team to their inventories", group: "shop", guess: "match", picks: 4, maxTries: 4,
    hard: true, noRepeatDays: 60, hints: [],
  },
  // The Omens: predict what happens next from a frozen moment of a real high-rank match.
  // No guesses or win/loss: one lock-in, scored out of 100 souls (src/lib/omens/scoring.ts).
  {
    slug: "clash", mode: "omen-clash", numeral: "XVII", name: "The Clash",
    subtitle: "Predict the teamfight", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  {
    slug: "beast", mode: "omen-beast", numeral: "XVIII", name: "The Beast",
    subtitle: "Predict the midboss", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  {
    slug: "rift", mode: "omen-rift", numeral: "XIX", name: "The Rift",
    subtitle: "Predict the Unstable Rift", group: "omens", guess: "omen", picks: 0, hints: [],
  },
  {
    slug: "constellation", mode: "constellation", numeral: "XXVIII", name: "The Constellation",
    subtitle: "Fill the 3x3 hero category grid", group: "stars", guess: "grid", picks: 4, maxTries: 4,
    noRepeatDays: 30, hints: [],
  },
  // The Séance family: 16 entities, 4 hidden groups of 4. Four tables a day per box, each its own frozen puzzle,
  // sharing one Vault box. 4 mistakes lose a table (src/lib/seance/play.ts).
  ...SEANCE_BOX_LIST.flatMap((b) =>
    b.tables.map(([kind, label]): LockDef => ({
      slug: `${b.id}-${kind}`, mode: "seance", numeral: b.numeral, name: b.name,
      subtitle: b.subtitle, group: "seance", guess: "seance", picks: 4, maxTries: 4,
      box: b.id, table: { kind, label },
      hints: [],
    })),
  ),
];

export const LOCK_BY_SLUG: Record<string, LockDef> = Object.fromEntries(LOCKS.map((l) => [l.slug, l]));

export function getLock(slug: string): LockDef | undefined {
  return LOCK_BY_SLUG[slug];
}

/** Slugs of locks that need audio (skipped entirely with the "Skip sound locks" setting). */
export const SOUND_LOCK_SLUGS: readonly string[] = LOCKS.filter((l) => l.needsAudio).map((l) => l.slug);

/** Locks that count for a player: every lock, minus the sound locks when they're skipped. */
export function countedLocks(skipSound: boolean): LockDef[] {
  return skipSound ? LOCKS.filter((l) => !l.needsAudio) : LOCKS;
}

export const SPIRIT_LOCKS = LOCKS.filter((l) => l.group === "spirits");
export const SHOP_LOCKS = LOCKS.filter((l) => l.group === "shop");
export const OMEN_LOCKS = LOCKS.filter((l) => l.group === "omens");
export const STAR_LOCKS = LOCKS.filter((l) => l.group === "stars");
/** Every Séance-family table (all boxes). */
export const SEANCE_LOCKS = LOCKS.filter((l) => !!l.box);
export const seanceLocksOf = (box: SeanceBoxId) => LOCKS.filter((l) => l.box === box);
/** The box a slug belongs to (null for every other lock). */
export const boxOf = (slug: string): SeanceBoxId | null => LOCK_BY_SLUG[slug]?.box ?? null;
/** Slug -> Omen kind. */
export const omenOf = (l: LockDef) => (l.group === "omens" ? (l.slug as "clash" | "beast" | "rift") : null);
export const isSeance = (slug: string) => !!LOCK_BY_SLUG[slug]?.box;
/** Slug of a box's lock page ("seance" redirects to its first table). */
export const SEANCE_BOX = SEANCE_BOXES.seance;

/**
 * What the Vault counts as "a lock": every lock on its own, except the Séance tables, which fold
 * into one box. Used for "x / N locks open", the daily share and per-day summaries.
 */
export type VaultUnit = { kind: "lock"; lock: LockDef } | { kind: "seance"; box: SeanceBoxId; locks: LockDef[] };
export const VAULT_UNITS: VaultUnit[] = [
  ...LOCKS.filter((l) => !l.box).map((lock) => ({ kind: "lock" as const, lock })),
  ...SEANCE_BOX_LIST.map((b) => ({ kind: "seance" as const, box: b.id, locks: seanceLocksOf(b.id) })),
];

/** Old 11-lock numbering (before The Cipher and The Echo), for migrating legacy local data. */
export const LEGACY_11_NUMERALS: Record<string, string> = {
  I: "reckoning", II: "visage", III: "sigil", IV: "testament", V: "incantation",
  VI: "belongings", VII: "ascension", VIII: "relic", IX: "appraisal", X: "lineage", XI: "measure",
};
