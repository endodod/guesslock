// Mechanics categories derived from the raw assets API (pure; unit-tested). Every derived category
// starts as a draft and needs admin approval (src/lib/seance/library.ts). Raw ability `behaviours` are
// mostly engine internals, so only the allowlisted, player-facing flags below ever become categories.
import { isEligibleHero } from "../deadlock/normalize";

type RawHero = {
  id: number; name: string; class_name: string; hero_type?: string | null; gun_tag?: string | null;
  complexity?: number | null; tags?: string[] | null; items?: Record<string, string>;
  starting_stats?: Record<string, { value?: number }> | null;
} & Parameters<typeof isEligibleHero>[0];
type RawAbility = { class_name: string; behaviours?: string[] | null; properties?: Record<string, { value?: unknown }> | null };

/** Player-facing ability behaviour flags that may become categories. Anything else is ignored. */
export const BEHAVIOUR_ALLOWLIST: Record<string, { label: string; explanation: string; difficulty: number }> = {
  CITADEL_ABILITY_BEHAVIOR_CAN_HEAL_PLAYERS: { label: "Can heal their allies", explanation: "Each has an ability that restores ally HP.", difficulty: 2 },
  CITADEL_ABILITY_BEHAVIOR_ALLOW_SELF_CAST: { label: "Can target themselves with an ability", explanation: "Each has an ability they can self-cast.", difficulty: 4 },
  CITADEL_ABILITY_BEHAVIOR_MOVEMENT: { label: "Has a movement ability", explanation: "Each has an ability that moves them.", difficulty: 2 },
  CITADEL_ABILITY_BEHAVIOR_PROJECTILE: { label: "Has a projectile ability", explanation: "Each has an ability that fires a projectile.", difficulty: 4 },
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
  label: string;
  explanation: string;
  source: "api" | "derived";
  difficulty: number;
  /** heroId -> yes / no / null (the API can't say: unknown, the admin decides). */
  members: Map<number, boolean | null>;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);

/** Every derivable category over the eligible heroes (including ones with fewer than 4 members). */
export function deriveCategories(heroesRaw: unknown[], itemsRaw: unknown[]): DerivedCategory[] {
  const heroes = (heroesRaw as RawHero[]).filter((h) => h && typeof h.id === "number" && isEligibleHero(h));
  const byClass = new Map<string, RawAbility>();
  for (const it of itemsRaw as RawAbility[]) if (it && typeof it.class_name === "string") byClass.set(it.class_name, it);
  const abilities = (h: RawHero) => SIGNATURES.map((k) => byClass.get(h.items?.[k] ?? "")).filter((a): a is RawAbility => !!a);
  const out: DerivedCategory[] = [];
  const add = (key: string, label: string, explanation: string, source: "api" | "derived", difficulty: number, test: (h: RawHero) => boolean | null) =>
    out.push({ key, label, explanation, source, difficulty, members: new Map(heroes.map((h) => [h.id, test(h)])) });

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
  return out;
}

export const memberCount = (c: DerivedCategory) => [...c.members.values()].filter((v) => v === true).length;
