// The Grimoire: groups of hero abilities, derived from the assets API (pure). Two types:
//   mechanics - how an ability works: slot, player-facing behaviour flags, cooldown, charges, damage, hero archetype
//   effects   - what its description says it does: slows, stuns, heals, barriers, ...
// Raw behaviour flags are mostly engine internals, so only the allowlisted ones below ever become groups.
import type { Normalized } from "../deadlock/normalize";
import type { NormAbility } from "../deadlock/types";
import type { DerivedCategory } from "./derive";
import { HERO_FALLBACK } from "./fallback";

type RawAbility = { class_name: string; behaviours?: string[] | null; properties?: Record<string, { value?: unknown }> | null };
type RawHero = { id: number; hero_type?: string | null; gun_tag?: string | null; name: string };
type Test = (a: NormAbility, raw: RawAbility | undefined) => boolean;

const B = "CITADEL_ABILITY_BEHAVIOR_";
const FLAGS: { flag: string; key: string; label: string; explanation: string; difficulty: number }[] = [
  { flag: "CHANNELLED", key: "channelled", label: "Channelled abilities", explanation: "Each has to be channelled to keep going.", difficulty: 2 },
  { flag: "PROJECTILE", key: "projectile", label: "Fires a projectile", explanation: "Each launches a projectile.", difficulty: 2 },
  { flag: "MOVEMENT", key: "movement", label: "Movement abilities", explanation: "Each moves the caster around.", difficulty: 2 },
  { flag: "NO_TARGET", key: "notarget", label: "Needs no target", explanation: "Each is cast without picking a target.", difficulty: 3 },
  { flag: "USE_INSTANT_CAST_UNIT_TARGET_UI", key: "unittarget", label: "Targets a unit", explanation: "Each is cast on a unit you point at.", difficulty: 3 },
  { flag: "ALLOW_ALT_CAST", key: "altcast", label: "Has an alternate cast", explanation: "Each has a second way to cast it.", difficulty: 4 },
  { flag: "ALLOW_SELF_CAST", key: "selfcast", label: "Can be cast on yourself", explanation: "Each can target the caster.", difficulty: 4 },
  { flag: "CAN_HEAL_PLAYERS", key: "heal", label: "Heals other players", explanation: "Each can restore ally health.", difficulty: 2 },
  { flag: "PROJECTILE_PASS_THROUGH_WORLD", key: "passwalls", label: "Projectile flies through walls", explanation: "Each projectile passes through the world.", difficulty: 4 },
  { flag: "CAN_CAST_ON_ZIPLINE", key: "zipline", label: "Castable on a zipline", explanation: "Each can be used while riding a zipline.", difficulty: 4 },
  { flag: "DONT_INTERRUPT_SPRINT", key: "sprint", label: "Does not stop your sprint", explanation: "Each can be cast without breaking a sprint.", difficulty: 4 },
  { flag: "COOLDOWN_ON_CHANNEL_END", key: "cdend", label: "Cooldown starts when the channel ends", explanation: "Each only goes on cooldown after its channel finishes.", difficulty: 4 },
];

/** `prop`: the ability also counts when it has a matching property with a value (e.g. a stun duration). */
const EFFECTS: { key: string; label: string; explanation: string; difficulty: number; re: RegExp; prop?: RegExp }[] = [
  { key: "slow", label: "Slows enemies", explanation: "Its description mentions a slow.", difficulty: 1, re: /\bslow/i, prop: /^Slow(Percent|Duration)/ },
  { key: "stun", label: "Stuns enemies", explanation: "Its description or stats mention a stun.", difficulty: 1, re: /\bstun/i, prop: /Stun/ },
  { key: "silence", label: "Silences enemies", explanation: "Its description mentions a silence.", difficulty: 2, re: /\bsilenc/i },
  { key: "heal", label: "Heals", explanation: "Its description mentions healing.", difficulty: 1, re: /\bheal/i },
  { key: "barrier", label: "Gives a barrier", explanation: "Its description mentions a barrier.", difficulty: 2, re: /\bbarrier/i },
  { key: "knock", label: "Knocks enemies back", explanation: "Its description mentions a knockback.", difficulty: 3, re: /knock/i },
  { key: "pull", label: "Pulls enemies in", explanation: "Its description mentions a pull.", difficulty: 3, re: /\bpull/i },
  { key: "immune", label: "Makes you unstoppable or invulnerable", explanation: "Its description mentions being unstoppable, immune or invulnerable.", difficulty: 3, re: /immun|unstoppable|invulnerab/i },
  { key: "dash", label: "Dashes or leaps", explanation: "Its description mentions a dash or leap.", difficulty: 2, re: /\bdash|\bleap/i },
  { key: "teleport", label: "Teleports", explanation: "Its description mentions teleporting.", difficulty: 3, re: /teleport|blink/i },
  { key: "launch", label: "Launches enemies into the air", explanation: "Its description mentions launching or lifting.", difficulty: 3, re: /launch|\blift|airborne/i, prop: /^LiftHeight/ },
  { key: "summon", label: "Summons something", explanation: "Its description mentions summoning.", difficulty: 3, re: /summon/i },
  { key: "wall", label: "Creates a wall", explanation: "Its description mentions a wall.", difficulty: 3, re: /\bwall/i },
  { key: "explode", label: "Explodes", explanation: "Its description mentions an explosion.", difficulty: 2, re: /explo/i },
  { key: "lifesteal", label: "Steals life", explanation: "Its description mentions lifesteal.", difficulty: 3, re: /life ?steal/i },
  { key: "dot", label: "Burns, bleeds or poisons", explanation: "Its description mentions damage over time.", difficulty: 3, re: /bleed|burn|poison|damage over time/i },
  { key: "stack", label: "Builds up stacks", explanation: "Its description mentions stacks.", difficulty: 3, re: /\bstack/i },
  { key: "stamina", label: "Affects stamina", explanation: "Its description mentions stamina.", difficulty: 4, re: /stamina/i },
  { key: "debuff", label: "Applies a debuff", explanation: "Its description mentions a debuff.", difficulty: 3, re: /debuff/i },
  { key: "bullet", label: "Boosts or changes your gun", explanation: "Its description mentions bullets or your weapon.", difficulty: 3, re: /bullet|weapon|\bammo/i },
  { key: "immobilize", label: "Immobilizes enemies", explanation: "It has an immobilize duration.", difficulty: 3, re: /immobili|\broot/i, prop: /Immobilize/ },
  { key: "firerate", label: "Boosts fire rate", explanation: "It grants bonus fire rate.", difficulty: 3, re: /fire rate/i, prop: /^BonusFireRate/ },
  { key: "movespeed", label: "Grants bonus move speed", explanation: "It grants bonus move speed.", difficulty: 2, re: /move speed|movement speed/i, prop: /^BonusMoveSpeed/ },
  { key: "resist", label: "Grants resistance", explanation: "It grants bullet or spirit resist.", difficulty: 3, re: /resist/i, prop: /^(BulletResist|TechResist)$/ },
  { key: "toss", label: "Tosses or pushes enemies", explanation: "It tosses enemies or pushes them away.", difficulty: 3, re: /\btoss|\bpush/i, prop: /^(TossDuration|PushForce)/ },
  { key: "tick", label: "Damages over time", explanation: "It ticks damage repeatedly.", difficulty: 2, re: /over time|per second|\btick/i, prop: /^(TickRate|DPS)$/ },
  { key: "allies", label: "Helps allies", explanation: "Its description mentions allies.", difficulty: 2, re: /\ball(y|ies)\b/i },
  { key: "trap", label: "Sets a trap or turret", explanation: "Its description mentions a trap, turret or mine.", difficulty: 4, re: /\btrap|turret|\bmine\b/i },
];

const ARCHETYPE: Record<string, string> = { marksman: "Marksman", mystic: "Mystic", brawler: "Brawler", assassin: "Assassin" };
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);

export function deriveAbilityCategories(heroesRaw: unknown[], itemsRaw: unknown[], norm: Pick<Normalized, "abilities" | "heroes">): DerivedCategory[] {
  const abilities = norm.abilities;
  const raw = new Map<string, RawAbility>();
  for (const it of itemsRaw as RawAbility[]) if (it && typeof it.class_name === "string") raw.set(it.class_name, it);
  const heroRaw = new Map((heroesRaw as RawHero[]).filter((h) => h && typeof h.id === "number").map((h) => [h.id, h]));
  const normHero = new Map(norm.heroes.map((h) => [h.id, h]));
  const out: DerivedCategory[] = [];
  const add = (type: "mechanics" | "effects", key: string, label: string, explanation: string, difficulty: number, test: Test) =>
    out.push({
      key: `ability:${type}:${key}`, entity: "ability", type, label, explanation, source: "derived", difficulty, vetted: true,
      members: new Map(abilities.map((a) => [a.id, test(a, raw.get(a.className))])),
    });
  const prop = (r: RawAbility | undefined, name: string) => num(r?.properties?.[name]?.value);
  const props = (r: RawAbility | undefined, re: RegExp, min = 0) =>
    Object.entries(r?.properties ?? {}).some(([k, p]) => re.test(k) && num(p?.value) > min);

  // ── mechanics ──
  const slots: [number, string, string][] = [[1, "Ability 1", "first"], [2, "Ability 2", "second"], [3, "Ability 3", "third"], [4, "Ultimates", "fourth (ultimate)"]];
  for (const [slot, label, nth] of slots) add("mechanics", `slot:${slot}`, label === "Ultimates" ? label : `${label} of a hero`, `Each is the ${nth} ability of its hero.`, 1, (a) => a.slot === slot);
  for (const f of FLAGS) add("mechanics", `flag:${f.key}`, f.label, f.explanation, f.difficulty, (_a, r) => (r?.behaviours ?? []).includes(B + f.flag));
  add("mechanics", "charges", "Has several charges", "Each holds 2 or more charges.", 3, (_a, r) => prop(r, "AbilityCharges") > 1);
  add("mechanics", "cd:short", "Cooldown of 20 seconds or less", "Each ability comes back within 20 seconds.", 3, (_a, r) => { const v = prop(r, "AbilityCooldown"); return v > 0 && v <= 20; });
  add("mechanics", "cd:long", "Cooldown of 60 seconds or more", "Each ability takes a minute or more to come back.", 3, (_a, r) => prop(r, "AbilityCooldown") >= 60);
  add("mechanics", "damage", "Deals spirit damage", "Each ability has a damage value that scales with spirit power.", 2, (_a, r) => Object.values(r?.properties ?? {}).some((p) => (p as { css_class?: string }).css_class === "tech_damage" && num(p?.value) > 0));
  add("mechanics", "stunprop", "Has a stun duration", "Each ability has a stun duration value.", 3, (_a, r) => props(r, /stun/i));
  add("mechanics", "slowprop", "Has a slow", "Each ability has a movement or fire rate slow value.", 3, (_a, r) => props(r, /slow/i));
  add("mechanics", "range", "Cast range of 30 meters or more", "Each ability can be cast from at least 30 m away.", 4, (_a, r) => prop(r, "AbilityCastRange") >= 30);
  add("mechanics", "duration", "Lasts for a set duration", "Each ability has a duration of 8 seconds or more.", 4, (_a, r) => prop(r, "AbilityDuration") >= 8);
  for (const [type, label] of Object.entries(ARCHETYPE))
    add("mechanics", `hero:${type}`, `Ability of a ${label}`, `Each belongs to a hero who is a ${label}.`, 2, (a) => (normHero.get(a.heroId)?.heroType ?? heroRaw.get(a.heroId)?.hero_type ?? HERO_FALLBACK[normHero.get(a.heroId)?.name ?? ""]?.hero_type ?? null) === type);
  const guns = [...new Set([...heroRaw.values()].map((h) => h.gun_tag).filter((g): g is string => !!g))];
  for (const gun of guns) {
    const n = abilities.filter((a) => (normHero.get(a.heroId)?.gunTag ?? null) === gun).length;
    if (n >= 8) add("mechanics", `gun:${gun}`, `Ability of a ${gun} hero`, `Each belongs to a hero whose gun is a ${gun} weapon.`, 3, (a) => (normHero.get(a.heroId)?.gunTag ?? null) === gun);
  }

  // ── effects ──
  for (const e of EFFECTS) add("effects", e.key, e.label, e.explanation, e.difficulty, (a, r) => e.re.test(a.description) || (!!e.prop && props(r, e.prop)));
  return out;
}
