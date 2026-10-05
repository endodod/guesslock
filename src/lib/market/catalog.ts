// The Black Market: what souls buy. Pure (shared by server and client).
//
// Souls are earned by playing (ranked plays, see UserStats.totalSouls) and spent on cases. A case holds collectibles of
// four rarities: shop items, hero cards, hero weapons, abilities, map objects, lock seals and flair (titles, name
// colours and Vault themes you can wear). Nothing here changes a puzzle, a score or a rank; the leaderboards rank by souls
// *earned*, so spending never costs a place. Cases are bought with souls only, never with money, and their odds are shown
// before buying. Every collectible has a value in souls: spare copies are kept and sell for more than a last copy, any item can be sold,
// Collector's Crates only ever hold what you don't own yet, and completing a set pays a one-time bonus.
import type { GameData } from "../engine/context";
import { LOCKS, VAULT_UNITS } from "@/locks.config";
import { scalePrice, scaleValue } from "../game/economy";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Slot = "title" | "color" | "theme";
export type Kind = "item" | "weapon" | "hero" | "ability" | "map" | "seal" | "flair";

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export const KIND_LABEL: Record<Kind, string> = {
  item: "Shop items", weapon: "Hero weapons", hero: "Hero cards", ability: "Abilities", map: "Map objects", seal: "Lock seals", flair: "Flair",
};
export const KIND_ORDER: Kind[] = ["item", "hero", "weapon", "ability", "map", "seal", "flair"];

/** What a collectible looks like to the browser (resolved on the server from game data). */
export type Collectible = {
  key: string;
  kind: Kind;
  name: string;
  rarity: Rarity;
  /** Souls (in today's economy, see game/economy.ts): what selling pays (part of it, more for a spare copy) and what set bonuses are made of. */
  value: number;
  /** A picture URL (shop items, heroes, weapons, abilities) or null. */
  image: string | null;
  /** A text glyph for things without a picture (map objects, seals, flair). */
  glyph: string | null;
  /** A short line under the name. */
  sub: string | null;
  /** What it belongs to, for sets: a shop slot, a map area, a lock group. */
  group?: string;
  /** The hero it belongs to (cards, weapons, abilities). */
  heroId?: number;
  /** Shop items: their tier; abilities: their slot (4 = ultimate). */
  tier?: number;
  /** Flair only: where it is worn and its value (title text, CSS colour, Vault theme id). */
  slot?: Slot;
  flair?: string;
};

// ───────────── flair (the old cosmetics: keys unchanged, so owned ones keep working) ─────────────

export type Cosmetic = { key: string; slot: Slot; name: string; rarity: Rarity; /** title: the text; color: a CSS colour (or gradient); theme: the Vault theme id. */ value: string };

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
/** Vault themes: CSS variables applied to the Vault page (src/app/globals.css `[data-vault-theme]`). */
export const THEME_IDS = COSMETICS.filter((c) => c.slot === "theme").map((c) => c.value);

const FLAIR_VALUE: Record<Rarity, number> = { common: 30, rare: 90, epic: 250, legendary: 900 };
const WEAPON_VALUE: Record<Rarity, number> = { common: 60, rare: 150, epic: 400, legendary: 1200 };
const HERO_VALUE: Record<Rarity, number> = { common: 80, rare: 200, epic: 520, legendary: 1500 };
const ABILITY_VALUE: Record<Rarity, number> = { common: 30, rare: 80, epic: 260, legendary: 800 };
const SEAL_VALUE: Record<Rarity, number> = { common: 50, rare: 140, epic: 380, legendary: 1000 };
const FLAIR_GLYPH: Record<Slot, string> = { title: "✦", color: "◍", theme: "▣" };

// ───────────── map objects ─────────────

type MapObject = { id: string; name: string; glyph: string; rarity: Rarity; value: number; sub: string; area: "Lane" | "Jungle" | "Prizes" };
export const MAP_OBJECTS: MapObject[] = [
  { id: "trooper", name: "Trooper", glyph: "🪖", rarity: "common", value: 40, sub: "Lane fodder, endlessly marching.", area: "Lane" },
  { id: "soul-orb", name: "Soul Orb", glyph: "🔵", rarity: "common", value: 50, sub: "Fresh from a fallen trooper.", area: "Lane" },
  { id: "zipline", name: "Zipline", glyph: "➰", rarity: "common", value: 60, sub: "The fast way across the map.", area: "Lane" },
  { id: "jungle-camp", name: "Jungle Camp", glyph: "🌲", rarity: "common", value: 70, sub: "Neutrals with something to protect.", area: "Jungle" },
  { id: "the-shop", name: "The Shop", glyph: "🛒", rarity: "common", value: 80, sub: "Where every soul ends up.", area: "Lane" },
  { id: "golden-statue", name: "Golden Statue", glyph: "🗿", rarity: "rare", value: 140, sub: "Break it for souls.", area: "Jungle" },
  { id: "guardian", name: "Guardian", glyph: "🛡️", rarity: "rare", value: 160, sub: "Holds the lane until it falls.", area: "Lane" },
  { id: "shrine", name: "Shrine", glyph: "⛩️", rarity: "rare", value: 180, sub: "Take it before they do.", area: "Jungle" },
  { id: "sinners-sacrifice", name: "Sinner's Sacrifice", glyph: "🩸", rarity: "rare", value: 200, sub: "A debt paid in souls.", area: "Jungle" },
  { id: "walker", name: "Walker", glyph: "🦿", rarity: "epic", value: 380, sub: "A lane's heavy iron.", area: "Lane" },
  { id: "soul-urn", name: "Soul Urn", glyph: "🏺", rarity: "epic", value: 450, sub: "Carry it home.", area: "Prizes" },
  { id: "mid-boss", name: "Mid-Boss", glyph: "👹", rarity: "epic", value: 500, sub: "Kill it, and take what it guards.", area: "Prizes" },
  { id: "rejuvenator", name: "Rejuvenator", glyph: "💠", rarity: "legendary", value: 1100, sub: "The prize that turns a match.", area: "Prizes" },
  { id: "patron", name: "The Patron", glyph: "👑", rarity: "legendary", value: 1500, sub: "The end of every game.", area: "Lane" },
];

// ───────────── building the catalogue from game data ─────────────

const TIER_RARITY: Rarity[] = ["common", "rare", "epic", "legendary"];

/** A stable pseudo-random 0-99 per key (heroes, weapons and abilities have no tier: their rarity is fixed this way, the same everywhere). */
function bucket(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 100;
}
const spread = (b: number, cuts: [number, number, number]): Rarity => (b < cuts[0] ? "common" : b < cuts[1] ? "rare" : b < cuts[2] ? "epic" : "legendary");
const weaponRarity = (heroId: number): Rarity => spread(bucket(`weapon:${heroId}`), [38, 73, 93]);
const heroRarity = (heroId: number): Rarity => spread(bucket(`hero:${heroId}`), [30, 65, 90]);
const abilityRarity = (id: number, slot: number): Rarity => {
  const b = bucket(`ability:${id}`);
  // Ultimates are the rare ones.
  return slot >= 4 ? (b < 65 ? "epic" : "legendary") : b < 70 ? "common" : "rare";
};
const SEAL_BY_GROUP: Record<string, Rarity> = { spirits: "common", shop: "rare", seance: "rare", omens: "epic", stars: "epic", words: "rare" };

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/**
 * Everything a case can hold: the shop's items (rarity from their tier, value a tenth of their cost), every hero's card,
 * weapon and abilities, the map objects, a seal for every lock of the Vault and the flair. Pure over game data, so it is
 * tested without a database.
 */
export function buildCollectibles(data: Pick<GameData, "items" | "heroes"> & Partial<Pick<GameData, "abilities">>): Collectible[] {
  const out: Collectible[] = [];
  for (const i of data.items) {
    if (!i.image || i.src.cost == null || i.src.cost <= 0) continue;
    const rarity = TIER_RARITY[Math.min(3, Math.max(0, (i.src.tier || 1) - 1))];
    out.push({
      key: `item:${i.id}`, kind: "item", name: i.name, rarity, value: scaleValue(Math.max(20, Math.round(i.src.cost / 50) * 5)),
      image: i.image, glyph: null, sub: `${cap(i.src.slot)} · tier ${i.src.tier}`, group: i.src.slot, tier: i.src.tier,
    });
  }
  const heroName = new Map(data.heroes.map((h) => [h.id, h.name]));
  for (const h of data.heroes) {
    const art = h.card ?? h.icon;
    if (art) {
      const rarity = heroRarity(h.id);
      out.push({ key: `hero:${h.id}`, kind: "hero", name: h.name, rarity, value: scaleValue(HERO_VALUE[rarity]), image: art, glyph: null, sub: h.src.heroType ? cap(h.src.heroType) : "Hero", heroId: h.id });
    }
    if (h.weapon) {
      const rarity = weaponRarity(h.id);
      out.push({ key: `weapon:${h.id}`, kind: "weapon", name: `${h.name}'s weapon`, rarity, value: scaleValue(WEAPON_VALUE[rarity]), image: h.weapon, glyph: null, sub: h.weaponType, heroId: h.id });
    }
  }
  for (const a of data.abilities ?? []) {
    if (!a.icon || !heroName.has(a.heroId)) continue;
    const rarity = abilityRarity(a.id, a.slot);
    out.push({
      key: `ability:${a.id}`, kind: "ability", name: a.name, rarity, value: scaleValue(ABILITY_VALUE[rarity]), image: a.icon, glyph: null,
      sub: `${heroName.get(a.heroId)} · ${a.slot >= 4 ? "Ultimate" : `Ability ${a.slot}`}`, heroId: a.heroId, tier: a.slot,
    });
  }
  for (const m of MAP_OBJECTS) out.push({ key: `map:${m.id}`, kind: "map", name: m.name, rarity: m.rarity, value: scaleValue(m.value), image: null, glyph: m.glyph, sub: m.sub, group: m.area });
  // A seal for every lock of the Vault (the three sorting boxes are one lock each).
  for (const u of VAULT_UNITS) {
    const lock = u.kind === "lock" ? u.lock : u.locks[0];
    const group = lock.group;
    const rarity = SEAL_BY_GROUP[group] ?? "common";
    const name = u.kind === "lock" ? lock.name : lock.name;
    out.push({
      key: `seal:${u.kind === "lock" ? lock.slug : u.box}`, kind: "seal", name: `Seal of ${name.replace(/^The /, "The ")}`, rarity, value: scaleValue(SEAL_VALUE[rarity]),
      image: null, glyph: lock.numeral, sub: { spirits: "Spirits lock", shop: "Shop lock", omens: "Omens lock", seance: "Sorting lock", stars: "Stars lock", words: "Words lock" }[group] ?? "Lock", group,
    });
  }
  for (const c of COSMETICS) out.push({ key: c.key, kind: "flair", name: c.name, rarity: c.rarity, value: scaleValue(FLAIR_VALUE[c.rarity]), image: null, glyph: FLAIR_GLYPH[c.slot], sub: { title: "Title", color: "Name colour", theme: "Vault theme" }[c.slot], slot: c.slot, flair: c.value, group: c.slot });
  return out;
}

// ───────────── cases ─────────────

export type CaseDef = {
  id: string;
  name: string;
  description: string;
  price: number;
  /** What it holds, with a weight each: the kind is drawn first, then an item of the rolled rarity. */
  kinds: Partial<Record<Kind, number>>;
  /** Chance per rarity (sums to 1). */
  odds: Record<Rarity, number>;
};

/**
 * Case prices are given on the scale the values were authored for (a Cursed Vault = 560) and brought to the economy: a
 * Cursed Vault costs about what a typical player earns by finishing every lock of a day (see game/economy.ts), the others
 * a share of that. Item values scale the same way, so every case keeps its payout ratio.
 */
export const CASES: CaseDef[] = [
  { id: "satchel", name: "Spellbinder's Satchel", description: "Abilities torn from the heroes' kits.", price: scalePrice(110), kinds: { ability: 1 }, odds: { common: 0.62, rare: 0.28, epic: 0.08, legendary: 0.02 } },
  { id: "scrapheap", name: "Scrapheap Crate", description: "Odds and ends from the shop floor.", price: scalePrice(140), kinds: { item: 1 }, odds: { common: 0.7, rare: 0.25, epic: 0.04, legendary: 0.01 } },
  { id: "shopkeeper", name: "Shopkeeper's Crate", description: "Shop items, with the odd bit of flair.", price: scalePrice(210), kinds: { item: 4, flair: 1 }, odds: { common: 0.45, rare: 0.35, epic: 0.16, legendary: 0.04 } },
  { id: "coffer", name: "Lockbreaker's Coffer", description: "Seals from every lock of the Vault.", price: scalePrice(240), kinds: { seal: 3, flair: 1 }, odds: { common: 0.4, rare: 0.35, epic: 0.2, legendary: 0.05 } },
  { id: "armory", name: "Armory Case", description: "Hero weapons, and what you build around them.", price: scalePrice(280), kinds: { weapon: 3, item: 1 }, odds: { common: 0.4, rare: 0.35, epic: 0.2, legendary: 0.05 } },
  { id: "dossier", name: "Hero Dossier", description: "Hero cards, with their weapons and abilities.", price: scalePrice(320), kinds: { hero: 3, weapon: 1, ability: 2 }, odds: { common: 0.35, rare: 0.35, epic: 0.22, legendary: 0.08 } },
  { id: "relic", name: "Relic Chest", description: "Objects from across the map: the Urn, the Mid-Boss, the Rejuvenator.", price: scalePrice(330), kinds: { map: 3, flair: 1 }, odds: { common: 0.3, rare: 0.38, epic: 0.25, legendary: 0.07 } },
  { id: "cursed", name: "The Cursed Vault", description: "Everything, and better odds at the top.", price: scalePrice(560), kinds: { item: 2, weapon: 1, hero: 1, ability: 2, map: 1, seal: 1, flair: 1 }, odds: { common: 0.1, rare: 0.3, epic: 0.38, legendary: 0.22 } },
];
export const CASE_BY_ID: Record<string, CaseDef> = Object.fromEntries(CASES.map((c) => [c.id, c]));

/**
 * What selling pays, as a share of an item's value. The last copy of something fetches SELL_RATE; a spare copy (one you own
 * more than once) fetches a rising share by its place in the stack: the first spare 75%, the second 85%, from the third on
 * 95%. A spare sells for more than the last copy, so a double is a small win, yet even the best rate stays below what a case
 * pays back on average (tested), so hoarding and reselling doubles can never make cases free money.
 */
export const SELL_RATE = 0.6;
export const SPARE_RATES = [0.75, 0.85, 0.95] as const;
/** The share paid for one copy when `copiesOwned` copies of it are owned (the copy sold is the top of the stack). */
export const sellRate = (copiesOwned: number) => (copiesOwned <= 1 ? SELL_RATE : SPARE_RATES[Math.min(copiesOwned - 2, SPARE_RATES.length - 1)]);
/** Souls for selling one copy of an item of which `copiesOwned` are owned (pure: the server pays it, the client shows it). */
export const sellPrice = (c: Pick<Collectible, "value">, copiesOwned = 1) => Math.round(c.value * sellRate(copiesOwned));
/** Souls for selling every copy beyond the first, top of the stack first (what "Sell spares" pays). */
export function sparesPrice(c: Pick<Collectible, "value">, copiesOwned: number): number {
  let sum = 0;
  for (let n = copiesOwned; n >= 2; n--) sum += sellPrice(c, n);
  return sum;
}

const poolCache = new WeakMap<Collectible[], Map<string, Record<Rarity, Collectible[]>>>();

/** What a case can drop, per rarity (remembered per catalogue: every draw asks for it). */
export function casePool(c: CaseDef, all: Collectible[]): Record<Rarity, Collectible[]> {
  let per = poolCache.get(all);
  if (!per) poolCache.set(all, (per = new Map()));
  let pool = per.get(c.id);
  if (!pool) {
    const kinds = Object.keys(c.kinds) as Kind[];
    pool = Object.fromEntries(RARITY_ORDER.map((r) => [r, all.filter((x) => x.rarity === r && kinds.includes(x.kind))])) as Record<Rarity, Collectible[]>;
    per.set(c.id, pool);
  }
  return pool;
}

/**
 * One draw. `rollRarity`, `rollKind` and `pick` are uniform in [0, 1) (crypto-random on the server, seeded in tests).
 * A rarity the case has nothing of falls through to the next lower one; among kinds that have something at that rarity,
 * the kind weights decide, then every item of the kind is equally likely.
 */
export function rollCase(c: CaseDef, all: Collectible[], rollRarity: number, rollKind: number, pick: number): Collectible {
  const pool = casePool(c, all);
  let acc = 0;
  let rarity: Rarity = "common";
  for (const r of RARITY_ORDER) {
    acc += c.odds[r];
    rarity = r;
    if (rollRarity < acc) break;
  }
  let i = RARITY_ORDER.indexOf(rarity);
  while (i > 0 && pool[RARITY_ORDER[i]].length === 0) i--;
  const items = pool[RARITY_ORDER[i]];
  if (items.length === 0) throw new Error(`case ${c.id} has nothing to drop`);
  const kinds = [...new Set(items.map((x) => x.kind))];
  const total = kinds.reduce((a, k) => a + (c.kinds[k] ?? 0), 0);
  let t = rollKind * total;
  let kind = kinds[kinds.length - 1];
  for (const k of kinds) {
    t -= c.kinds[k] ?? 0;
    if (t < 0) { kind = k; break; }
  }
  const of = items.filter((x) => x.kind === kind);
  return of[Math.min(of.length - 1, Math.floor(pick * of.length))];
}

/** Expected value (souls) of one opening, counting duplicates as worth nothing extra. For tuning prices. */
export function expectedValue(c: CaseDef, all: Collectible[]): number {
  const pool = casePool(c, all);
  let ev = 0;
  for (const r of RARITY_ORDER) {
    const items = pool[r];
    if (!items.length) continue;
    const kinds = [...new Set(items.map((x) => x.kind))];
    const total = kinds.reduce((a, k) => a + (c.kinds[k] ?? 0), 0);
    for (const k of kinds) {
      const of = items.filter((x) => x.kind === k);
      ev += c.odds[r] * ((c.kinds[k] ?? 0) / total) * (of.reduce((a, x) => a + x.value, 0) / of.length);
    }
  }
  return ev;
}

/** A sample of what a case holds for the opening animation: a few of every rarity, spread across its kinds. */
export function casePreview(c: CaseDef, all: Collectible[], perRarity = 8): Collectible[] {
  const pool = casePool(c, all);
  const out: Collectible[] = [];
  for (const r of RARITY_ORDER) {
    const items = pool[r];
    const step = Math.max(1, items.length / perRarity);
    for (let i = 0; i < Math.min(perRarity, items.length); i++) out.push(items[Math.floor(i * step)]);
  }
  return out;
}

/** The exact chance of every item a case can drop, as `rollCase` produces it (for tuning and the completion simulation). */
export function caseOdds(c: CaseDef, all: Collectible[]): Map<string, number> {
  const pool = casePool(c, all);
  const out = new Map<string, number>();
  let carry = 0; // the chance of a rarity the case has nothing of, which falls through to the next lower one
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    const r = RARITY_ORDER[i];
    const items = pool[r];
    const p = c.odds[r] + carry;
    if (!items.length) { carry = p; continue; }
    carry = 0;
    const kinds = [...new Set(items.map((x) => x.kind))];
    const total = kinds.reduce((a, k) => a + (c.kinds[k] ?? 0), 0);
    for (const k of kinds) {
      const of = items.filter((x) => x.kind === k);
      for (const x of of) out.set(x.key, (out.get(x.key) ?? 0) + (p * ((c.kinds[k] ?? 0) / total)) / of.length);
    }
  }
  return out;
}

// ───────────── collector's crates ─────────────

/** A Collector's Crate costs this many times the average value of what it can still give: it takes the luck (and the duplicate) away. */
export const CRATE_MARKUP = 2;
/** ...and never less than this many times the cheapest case, so early on a crate costs more per new item than opening cases would. */
export const CRATE_FLOOR = 1.25;

export type Crate = {
  id: string;
  rarity: Rarity;
  name: string;
  /** What is still missing of this rarity, the only things the crate can give. */
  missing: number;
  /** Every collectible of this rarity. */
  total: number;
  /** Souls, 0 when nothing of the tier is missing (the crate is then unavailable). */
  price: number;
};
export const crateId = (r: Rarity) => `missing:${r}`;
export const crateRarity = (id: string): Rarity | null => RARITY_ORDER.find((r) => crateId(r) === id) ?? null;

/**
 * The crate of one rarity for a collection: the collectibles of that rarity not owned (sorted by key, what the draw picks
 * from uniformly) and the price: CRATE_MARKUP times their average value, never below the dearest of them (so a crate never
 * sells an item for less than it is worth) or CRATE_FLOOR times the cheapest case, rounded up to 10. Pure, the same on server and client.
 */
export function collectorsCrate(rarity: Rarity, all: Collectible[], owned: ReadonlySet<string>): Crate & { pool: Collectible[] } {
  const tier = all.filter((x) => x.rarity === rarity);
  const pool = tier.filter((x) => !owned.has(x.key)).sort((a, b) => (a.key < b.key ? -1 : 1));
  const avg = pool.reduce((a, x) => a + x.value, 0) / (pool.length || 1);
  const dearest = pool.reduce((a, x) => Math.max(a, x.value), 0);
  const price = pool.length ? Math.ceil(Math.max(avg * CRATE_MARKUP, dearest, CRATE_FLOOR * Math.min(...CASES.map((c) => c.price))) / 10) * 10 : 0;
  return { id: crateId(rarity), rarity, name: `${RARITY_LABEL[rarity]} Collector's Crate`, missing: pool.length, total: tier.length, price, pool };
}

// ───────────── sets ─────────────

export type SetDef = { id: string; name: string; /** Where the set is listed. */ category: string; keys: string[]; reward: number };

export const SET_CATEGORIES = ["Heroes", "Shop", "Map", "Locks", "Flair", "By rarity", "Grand"] as const;

/**
 * Sets to complete once each for a bonus (a quarter to a third of their items' value): every kind and rarity, each shop
 * slot and tier, each hero's kit (card, weapon and abilities), all ultimates, the map areas, the locks' seals, the flair
 * types, and a few grand ones.
 */
export function buildSets(all: Collectible[]): SetDef[] {
  const sets: SetDef[] = [];
  const add = (id: string, name: string, category: (typeof SET_CATEGORIES)[number], xs: Collectible[], rate = 0.25, min = 2) => {
    if (xs.length < min) return;
    const sum = xs.reduce((a, x) => a + x.value, 0);
    sets.push({ id, name, category, keys: xs.map((x) => x.key), reward: Math.max(5, Math.round((sum * rate) / 5) * 5) });
  };
  const kindOf = (k: Kind) => all.filter((x) => x.kind === k);

  // By kind and rarity (the sets that are small enough to be within reach).
  for (const kind of KIND_ORDER) for (const r of RARITY_ORDER) {
    const xs = all.filter((x) => x.kind === kind && x.rarity === r);
    if (xs.length <= 60) add(`${kind}:${r}`, `${RARITY_LABEL[r]} ${KIND_LABEL[kind].toLowerCase()}`, "By rarity", xs);
  }

  // Shop: every slot, and every slot at every tier.
  const items = kindOf("item");
  for (const slot of ["weapon", "vitality", "spirit"]) {
    const xs = items.filter((x) => x.group === slot);
    add(`slot:${slot}`, `All ${slot} items`, "Shop", xs, 0.2);
    for (const tier of [1, 2, 3, 4]) add(`slot:${slot}:${tier}`, `${cap(slot)} items, tier ${tier}`, "Shop", xs.filter((x) => x.tier === tier));
  }

  // Heroes: each hero's kit, and the all-heroes sets.
  const heroes = kindOf("hero");
  for (const h of heroes) {
    const kit = all.filter((x) => x.heroId === h.heroId);
    add(`kit:${h.heroId}`, `${h.name}'s full kit`, "Heroes", kit, 0.3, 3);
  }
  add("heroes:all", "Every hero card", "Heroes", heroes, 0.25);
  add("weapons:all", "Every hero weapon", "Heroes", kindOf("weapon"), 0.25);
  add("ultimates:all", "Every ultimate", "Heroes", kindOf("ability").filter((x) => x.tier === 4), 0.25);
  for (const slot of [1, 2, 3]) add(`abilities:${slot}`, `Every ability ${slot}`, "Heroes", kindOf("ability").filter((x) => x.tier === slot), 0.25);

  // Map: each area and the whole map.
  const map = kindOf("map");
  for (const area of ["Lane", "Jungle", "Prizes"]) add(`map:area:${area.toLowerCase()}`, `${area === "Prizes" ? "Map prizes" : `${area} objects`}`, "Map", map.filter((x) => x.group === area), 0.3);
  add("map:all", "Every map object", "Map", map, 0.5);

  // Locks: the seals of each lock family.
  const seals = kindOf("seal");
  const groupName: Record<string, string> = { spirits: "Spirits", shop: "Shop", omens: "Omens", seance: "Sorting", stars: "Stars", words: "Words" };
  for (const g of Object.keys(groupName)) add(`seals:${g}`, `${groupName[g]} locks' seals`, "Locks", seals.filter((x) => x.group === g), 0.3);
  add("seals:all", "Every lock's seal", "Locks", seals, 0.4);

  // Flair.
  for (const [slot, label] of [["title", "titles"], ["color", "name colours"], ["theme", "Vault themes"]] as const) add(`flair:${slot}`, `Every one of the ${label}`, "Flair", all.filter((x) => x.slot === slot), 0.3);

  // Grand sets: trophies.
  add("grand:shop", "The whole shop", "Grand", items, 0.3);
  add("grand:legendary", "Every legendary", "Grand", all.filter((x) => x.rarity === "legendary"), 0.3);
  add("grand:vault", "The whole Vault", "Grand", all, 0.3);
  // Referenced so a locks.config change that adds groups shows up in tests, not silently as an empty set.
  void LOCKS;
  return sets;
}
