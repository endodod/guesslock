// Categories derived from the raw assets API (pure; unit-tested). deriveCategories() = the heroes' mechanics groups;
// deriveAll() adds the items' and abilities' groups and the curated ones (heroes' lore and visuals, items' and abilities' looks).
// Raw ability `behaviours` are mostly engine internals, so only the allowlisted, player-facing flags below ever become categories.
import { isEligibleHero, normalizeAll } from "../deadlock/normalize";
import type { SeanceEntity } from "@/locks.config";
import type { CategoryType } from "./types";
import { HERO_FALLBACK } from "./fallback";
import { deriveItemCategories } from "./derive-items";
import { deriveAbilityCategories } from "./derive-abilities";
import { deriveHeroLore } from "./derive-lore";
import { deriveCuratedVisuals } from "./curated-visuals";

type RawHero = {
  id: number; name: string; class_name: string; hero_type?: string | null; gun_tag?: string | null;
  complexity?: number | null; tags?: string[] | null; items?: Record<string, string>;
  starting_stats?: Record<string, { value?: number }> | null;
} & Parameters<typeof isEligibleHero>[0];
type RawAbility = { class_name: string; behaviours?: string[] | null; properties?: Record<string, { value?: unknown }> | null; weapon_info?: Record<string, unknown> | null };

/** Player-facing ability behaviour flags that may become categories. Anything else is ignored. */
export const BEHAVIOUR_ALLOWLIST: Record<string, { label: string; explanation: string; difficulty: number }> = {
  CITADEL_ABILITY_BEHAVIOR_CAN_HEAL_PLAYERS: { label: "Can heal their allies", explanation: "Each has an ability that restores ally HP.", difficulty: 2 },
  CITADEL_ABILITY_BEHAVIOR_ALLOW_SELF_CAST: { label: "Can target themselves with an ability", explanation: "Each has an ability they can self-cast.", difficulty: 4 },
  CITADEL_ABILITY_BEHAVIOR_MOVEMENT: { label: "Has a movement ability", explanation: "Each has an ability that moves them.", difficulty: 2 },
  CITADEL_ABILITY_BEHAVIOR_PROJECTILE: { label: "Has a projectile ability", explanation: "Each has an ability that fires a projectile.", difficulty: 4 },
  CITADEL_ABILITY_BEHAVIOR_CHANNELLED: { label: "Has a channelled ability", explanation: "Each has an ability they have to keep channelling.", difficulty: 3 },
  CITADEL_ABILITY_BEHAVIOR_ALLOW_ALT_CAST: { label: "Has an ability with an alternate cast", explanation: "Each has an ability with a second way to cast it.", difficulty: 4 },
};

/** Numeric cuts on hero stats: fixed and stable; members are recomputed on every sync. */
export const STAT_CUTS: { key: string; label: string; explanation: string; difficulty: number; test: (h: RawHero) => boolean | null }[] = [
  {
    key: "derived:health:850+", label: "Base health 850 or more", explanation: "Each starts with at least 850 max health.", difficulty: 3,
    test: (h) => (h.starting_stats?.max_health?.value == null ? null : h.starting_stats.max_health.value >= 850),
  },
  {
    key: "derived:health:<700", label: "Base health under 700", explanation: "Each starts with less than 700 max health.", difficulty: 3,
    test: (h) => (h.starting_stats?.max_health?.value == null ? null : h.starting_stats.max_health.value < 700),
  },
];

const ARCHETYPE: Record<string, string> = { marksman: "Marksman", mystic: "Mystic", brawler: "Brawler", assassin: "Assassin" };
const SIGNATURES = ["signature1", "signature2", "signature3", "signature4"];

export type DerivedCategory = {
  key: string;
  entity: SeanceEntity;
  type: CategoryType;
  label: string;
  explanation: string;
  source: "api" | "derived" | "curated";
  difficulty: number;
  /** Reviewed by hand when written: created approved instead of as a draft. */
  vetted?: boolean;
  /** Entity id -> yes / no / null (the data cannot say: unknown, the admin decides). */
  members: Map<number, boolean | null>;
};


const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);

/** Every derivable category over the eligible heroes (including ones with fewer than 4 members). */
export function deriveCategories(heroesRaw: unknown[], itemsRaw: unknown[]): DerivedCategory[] {
  const heroes = (heroesRaw as RawHero[])
    .filter((h) => h && typeof h.id === "number" && isEligibleHero(h))
    .map((h) => ({ ...h, hero_type: h.hero_type ?? HERO_FALLBACK[h.name]?.hero_type, gun_tag: h.gun_tag ?? HERO_FALLBACK[h.name]?.gun_tag }));
  const byClass = new Map<string, RawAbility>();
  for (const it of itemsRaw as RawAbility[]) if (it && typeof it.class_name === "string") byClass.set(it.class_name, it);
  const abilities = (h: RawHero) => SIGNATURES.map((k) => byClass.get(h.items?.[k] ?? "")).filter((a): a is RawAbility => !!a);
  const out: DerivedCategory[] = [];
  const add = (key: string, label: string, explanation: string, source: "api" | "derived", difficulty: number, test: (h: RawHero) => boolean | null) =>
    out.push({ key, entity: "hero", type: "mechanics", label, explanation, source, difficulty, vetted: true, members: new Map(heroes.map((h) => [h.id, test(h)])) });

  // Straight API fields: archetype, weapon type, complexity, shared hero tags.
  const values = <T,>(f: (h: RawHero) => T | null | undefined) => [...new Set(heroes.map(f).filter((v): v is T => v !== null && v !== undefined && v !== ""))];
  for (const t of values((h) => h.hero_type))
    add(`api:hero_type:${t}`, `Archetype: ${ARCHETYPE[t] ?? t}`, `Each is listed as a ${ARCHETYPE[t] ?? t}.`, "api", 1, (h) => (h.hero_type ? h.hero_type === t : null));
  for (const g of values((h) => h.gun_tag))
    add(`api:gun_tag:${g}`, `Weapon type: ${g}`, `Each hero's gun is a ${g} weapon.`, "api", 2, (h) => (h.gun_tag ? h.gun_tag === g : null));
  for (const c of values((h) => h.complexity))
    add(`api:complexity:${c}`, `Complexity: ${c} ${c === 1 ? "star" : "stars"}`, `Each has a complexity rating of ${c}.`, "api", 3, (h) => (h.complexity == null ? null : h.complexity === c));
  for (const tag of [...new Set(heroes.flatMap((h) => h.tags ?? []))])
    add(`api:tag:${tag}`, `Hero tag: ${tag}`, `Each has "${tag}" among their hero tags.`, "api", 3, (h) => (h.tags ? h.tags.includes(tag) : null));

  // Ability data. A hero without ability data is "unknown", never "no".
  const hasAbilities = (h: RawHero) => abilities(h).length > 0;
  for (const [flag, def] of Object.entries(BEHAVIOUR_ALLOWLIST))
    add(`derived:behaviour:${flag}`, def.label, def.explanation, "derived", def.difficulty,
      (h) => (hasAbilities(h) ? abilities(h).some((a) => (a.behaviours ?? []).includes(flag)) : null));
  add("derived:charges", "Has an ability with multiple charges", "Each has an ability that holds 2 or more charges.", "derived", 3,
    (h) => (hasAbilities(h) ? abilities(h).some((a) => num(a.properties?.AbilityCharges?.value) > 1) : null));
  add("derived:stun", "Has an ability that stuns", "Each has an ability with a stun duration.", "derived", 3,
    (h) => (hasAbilities(h) ? abilities(h).some((a) => Object.entries(a.properties ?? {}).some(([k, p]) => /stun/i.test(k) && num(p?.value) > 0)) : null));
  for (const cut of STAT_CUTS) add(cut.key, cut.label, cut.explanation, "derived", cut.difficulty, cut.test);

  // Gun and movement numbers: fixed cuts with at least 4 members each (a new hero is evaluated automatically).
  const gun = (h: RawHero) => byClass.get(h.items?.weapon_primary ?? "")?.weapon_info ?? null;
  const gunNum = (h: RawHero, k: string) => { const v = num(gun(h)?.[k]); return Number.isFinite(v) ? v : null; };
  const stat = (h: RawHero, k: string) => { const v = h.starting_stats?.[k]?.value; return typeof v === "number" ? v : null; };
  const cut = (key: string, label: string, explanation: string, difficulty: number, read: (h: RawHero) => number | null, test: (v: number) => boolean) =>
    add(key, label, explanation, "derived", difficulty, (h) => { const v = read(h); return v === null ? null : test(v); });
  cut("derived:gun:fast", "Fires 10 or more bullets per second", "Each hero's gun has a cycle time of 0.1 s or less.", 3, (h) => gunNum(h, "cycle_time"), (v) => v <= 0.105);
  cut("derived:gun:slow", "Fires 2 or fewer bullets per second", "Each hero's gun has a cycle time of 0.5 s or more.", 3, (h) => gunNum(h, "cycle_time"), (v) => v >= 0.5);
  cut("derived:gun:bigclip", "Clip of 30 or more bullets", "Each hero's gun holds at least 30 bullets.", 3, (h) => gunNum(h, "clip_size"), (v) => v >= 30);
  cut("derived:gun:smallclip", "Clip of 10 or fewer bullets", "Each hero's gun holds at most 10 bullets.", 3, (h) => gunNum(h, "clip_size"), (v) => v <= 10);
  cut("derived:gun:pellets", "Gun fires several pellets at once", "Each hero's gun fires 3 or more bullets per shot.", 2, (h) => gunNum(h, "bullets"), (v) => v >= 3);
  cut("derived:gun:bigdamage", "18 or more damage per bullet", "Each hero's gun deals at least 18 damage per bullet.", 4, (h) => gunNum(h, "bullet_damage"), (v) => v >= 18);
  cut("derived:gun:tinydamage", "5 or less damage per bullet", "Each hero's gun deals at most 5 damage per bullet.", 4, (h) => gunNum(h, "bullet_damage"), (v) => v <= 5);
  cut("derived:move:fast", "Move speed of 7.9 or more", "Each hero has a base move speed of 7.9 m/s or more.", 4, (h) => stat(h, "max_move_speed"), (v) => v >= 7.9);
  cut("derived:move:slow", "Move speed of 6.3 or less", "Each hero has a base move speed of 6.3 m/s or less.", 4, (h) => stat(h, "max_move_speed"), (v) => v <= 6.3);
  cut("derived:stamina:2", "Only 2 stamina", "Each hero starts with just 2 stamina (dashes).", 3, (h) => stat(h, "stamina"), (v) => v <= 2);
  cut("derived:stamina:4", "4 stamina", "Each hero starts with 4 stamina (dashes).", 3, (h) => stat(h, "stamina"), (v) => v >= 4);
  // Ultimates: what the ultimate (signature4) is like.
  const ult = (h: RawHero) => byClass.get(h.items?.signature4 ?? "") ?? null;
  const ultHas = (flag: string) => (h: RawHero) => (ult(h) ? (ult(h)!.behaviours ?? []).includes(flag) : null);
  add("derived:ult:channelled", "Ultimate is channelled", "Each hero's ultimate has to be channelled.", "derived", 3, ultHas("CITADEL_ABILITY_BEHAVIOR_CHANNELLED"));
  add("derived:ult:projectile", "Ultimate fires a projectile", "Each hero's ultimate launches a projectile.", "derived", 4, ultHas("CITADEL_ABILITY_BEHAVIOR_PROJECTILE"));
  add("derived:ult:movement", "Ultimate moves them", "Each hero's ultimate is a movement ability.", "derived", 4, ultHas("CITADEL_ABILITY_BEHAVIOR_MOVEMENT"));
  return out;
}

// ───────────── all entities ─────────────

/** Everything the sync maintains: heroes (mechanics, lore, visuals), items (stats, effects, visuals), abilities (mechanics, effects, visuals). */
export function deriveAll(heroesRaw: unknown[], itemsRaw: unknown[]): DerivedCategory[] {
  const norm = normalizeAll(heroesRaw, itemsRaw);
  return [
    ...deriveCategories(heroesRaw, itemsRaw),
    ...deriveHeroLore(heroesRaw, norm),
    ...deriveItemCategories(itemsRaw, norm),
    ...deriveAbilityCategories(heroesRaw, itemsRaw, norm),
    ...deriveCuratedVisuals(norm),
  ];
}

export const memberCount = (c: DerivedCategory) => [...c.members.values()].filter((v) => v === true).length;
