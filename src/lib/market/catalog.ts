// The Black Market: what souls buy. Pure (shared by server and client).
//
// Souls are earned by playing (ranked plays, see UserStats.totalSouls) and spent here on cosmetics only: nothing in the
// market changes a puzzle, a score or a rank. The leaderboards rank by souls *earned*, so spending never costs a place.
// Cases are bought with souls only, never with money, and their odds are shown before buying.

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Slot = "title" | "color" | "theme";

export type Cosmetic = {
  key: string;
  slot: Slot;
  name: string;
  rarity: Rarity;
  /** title: the text; color: a CSS colour (or gradient for legendaries); theme: the Vault theme id. */
  value: string;
};

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export const COSMETICS: Cosmetic[] = [
  // Titles: shown under your name on the leaderboards and your account.
  { key: "title:lockpick", slot: "title", name: "Lockpick", rarity: "common", value: "Lockpick" },
  { key: "title:apprentice", slot: "title", name: "Vault Apprentice", rarity: "common", value: "Vault Apprentice" },
  { key: "title:tinkerer", slot: "title", name: "Tinkerer", rarity: "common", value: "Tinkerer" },
  { key: "title:soul-broker", slot: "title", name: "Soul Broker", rarity: "rare", value: "Soul Broker" },
  { key: "title:rift-walker", slot: "title", name: "Rift Walker", rarity: "rare", value: "Rift Walker" },
  { key: "title:midboss-hunter", slot: "title", name: "Midboss Hunter", rarity: "rare", value: "Midboss Hunter" },
  { key: "title:whisperer", slot: "title", name: "Spirit Whisperer", rarity: "epic", value: "Spirit Whisperer" },
  { key: "title:keeper", slot: "title", name: "Keeper of Keys", rarity: "epic", value: "Keeper of Keys" },
  { key: "title:patron", slot: "title", name: "Patron of the Cursed Apple", rarity: "legendary", value: "Patron of the Cursed Apple" },
  // Name colours: your name on the leaderboards.
  { key: "color:brass", slot: "color", name: "Brass", rarity: "common", value: "#c9a45c" },
  { key: "color:ash", slot: "color", name: "Ash", rarity: "common", value: "#b8ad9e" },
  { key: "color:amber", slot: "color", name: "Amber", rarity: "common", value: "#e0962a" },
  { key: "color:sapphire", slot: "color", name: "Sapphire", rarity: "rare", value: "#7d9ef0" },
  { key: "color:ecto", slot: "color", name: "Ectoplasm", rarity: "rare", value: "#7fe3c2" },
  { key: "color:cursed", slot: "color", name: "Cursed", rarity: "epic", value: "#a98bf0" },
  { key: "color:blood", slot: "color", name: "Blood Moon", rarity: "epic", value: "#e0645c" },
  { key: "color:gilded", slot: "color", name: "Gilded", rarity: "legendary", value: "linear-gradient(90deg,#f6dd9a,#c9a45c,#f6dd9a)" },
  // Vault themes: recolour your own Vault.
  { key: "theme:verdigris", slot: "theme", name: "Verdigris", rarity: "rare", value: "verdigris" },
  { key: "theme:obsidian", slot: "theme", name: "Obsidian", rarity: "rare", value: "obsidian" },
  { key: "theme:velvet", slot: "theme", name: "Royal Velvet", rarity: "epic", value: "velvet" },
  { key: "theme:ectoplasm", slot: "theme", name: "Ectoplasm", rarity: "epic", value: "ectoplasm" },
  { key: "theme:gilded", slot: "theme", name: "Gilded Vault", rarity: "legendary", value: "gilded" },
];

export const COSMETIC_BY_KEY: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.key, c]));

export type CaseDef = {
  id: string;
  name: string;
  description: string;
  price: number;
  slots: Slot[];
  /** Chance per rarity (sums to 1). */
  odds: Record<Rarity, number>;
};

export const CASES: CaseDef[] = [
  {
    id: "strongbox", name: "Pickpocket's Strongbox", description: "Titles and name colours.", price: 250, slots: ["title", "color"],
    odds: { common: 0.62, rare: 0.27, epic: 0.09, legendary: 0.02 },
  },
  {
    id: "reliquary", name: "Spirit Reliquary", description: "Rarer titles and colours, and Vault themes.", price: 600, slots: ["title", "color", "theme"],
    odds: { common: 0.3, rare: 0.4, epic: 0.23, legendary: 0.07 },
  },
];
export const CASE_BY_ID: Record<string, CaseDef> = Object.fromEntries(CASES.map((c) => [c.id, c]));

/** A duplicate is turned back into souls: this share of the case price. */
export const DUPLICATE_REFUND = 0.4;

/** What a case can drop. A rarity with nothing in the case's slots falls through to the next lower one. */
export function casePool(c: CaseDef): Record<Rarity, Cosmetic[]> {
  const pool = Object.fromEntries(RARITY_ORDER.map((r) => [r, COSMETICS.filter((x) => x.rarity === r && c.slots.includes(x.slot))])) as Record<Rarity, Cosmetic[]>;
  return pool;
}

/**
 * One draw. `roll` and `pick` are uniform in [0, 1) (crypto-random on the server, seeded in tests).
 * Returns the item; the caller checks for duplicates.
 */
export function rollCase(c: CaseDef, roll: number, pick: number): Cosmetic {
  const pool = casePool(c);
  let acc = 0;
  let rarity: Rarity = "common";
  for (const r of RARITY_ORDER) {
    acc += c.odds[r];
    if (roll < acc) { rarity = r; break; }
    rarity = r;
  }
  // Fall back to a lower rarity if this case has nothing of the rolled one.
  let i = RARITY_ORDER.indexOf(rarity);
  while (i > 0 && pool[RARITY_ORDER[i]].length === 0) i--;
  const items = pool[RARITY_ORDER[i]];
  return items[Math.min(items.length - 1, Math.floor(pick * items.length))];
}

/** Vault themes: CSS variables applied to the Vault page (src/app/globals.css `[data-vault-theme]`). */
export const THEME_IDS = COSMETICS.filter((c) => c.slot === "theme").map((c) => c.value);

/** Trades: at most this many items per side, and souls only up to this amount per offer. */
export const TRADE_MAX_ITEMS = 6;
export const TRADE_MAX_SOULS = 10_000;
/** Open offers a player may have at once (outgoing). */
export const TRADE_MAX_OPEN = 10;
