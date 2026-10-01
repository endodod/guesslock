// Normalized game data, stored as Hero/Ability/Item.source in the DB.
// Derived from real API payloads (see src/lib/deadlock/schemas.ts).

export type Slot = "weapon" | "vitality" | "spirit";

export type NormHero = {
  id: number;
  className: string;
  name: string;
  gender: string | null; // "male" | "female" | other API values
  heroType: string | null; // "marksman" | "mystic" | "brawler" | "assassin"
  complexity: number | null;
  gunTag: string | null; // e.g. "Rapid Fire"
  tags: string[];
  lore: string | null;
  role: string | null;
  playstyle: string | null;
  images: { card: string | null; small: string | null; vertical: string | null };
  maxHealth: number | null;
  bulletDamage: number | null;
  dps: number | null;
  /** Shots per second (1 / cycle time). Missing in data synced before The Reckoning split DPS. */
  fireRate?: number | null;
  abilityClassNames: string[]; // signature1..4 in order
};

export type NormAbility = {
  id: number;
  className: string;
  name: string;
  heroId: number;
  slot: number; // 1..4 (4 = ultimate)
  image: string | null;
  description: string; // rendered, unredacted
  quip: string | null;
  tiers: [string | null, string | null, string | null]; // rendered T1..T3 upgrade texts
};

export type StatBonus = {
  key: string;
  label: string;
  value: number;
  display: string; // e.g. "+25%"
  prefix: string;
  postfix: string;
  conditional: boolean;
  scales: boolean; // has a scale function (e.g. spirit scaling)
};

export type NormItem = {
  id: number;
  className: string;
  name: string;
  slot: Slot;
  tier: number;
  cost: number | null;
  activation: string | null; // "passive" | "instant_cast" | "press" | ...
  isActive: boolean;
  componentClassNames: string[];
  image: string | null; // colored shop image
  glyph: string | null; // small monochrome icon
  cooldown: number | null;
  statBonuses: StatBonus[];
  description: string;
};
