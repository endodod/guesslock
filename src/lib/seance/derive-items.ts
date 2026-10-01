// The Bazaar: groups of shop items, derived from the assets API (pure). Two types:
//   stats   - what an item is and gives: slot, active/passive, cost, components, the stat bonuses on its tooltip
//   effects - what its description says it does: slows, stuns, heals, barriers, ...
// An item without a description simply has no effects text, so it is a clear "no" for every effects group.
import { config } from "../config";
import type { Normalized } from "../deadlock/normalize";
import type { NormItem } from "../deadlock/types";
import type { DerivedCategory } from "./derive";

type Test = (i: NormItem) => boolean;

/** Shop items that are in play (Street Brawl legendaries, tier 5, are not). */
export const bazaarItems = (norm: Pick<Normalized, "items">): NormItem[] => norm.items.filter((i) => !config.excludedItemTiers.includes(i.tier));

/** Player-facing names for the stat bonus labels on item tooltips. */
const STAT_NAMES: Record<string, string> = {
  "Bonus Health": "bonus health", "Out of Combat Regen": "out-of-combat health regen", "Weapon Damage": "weapon damage", "Spirit Power": "spirit power",
  "Spirit Resist": "spirit resist", "Sprint Speed": "sprint speed", "Bullet Resist": "bullet resist", "Max Ammo": "max ammo", "Fire Rate": "fire rate",
  "Ability Range": "ability range", "Bullet Velocity": "bullet velocity", "Melee Damage": "melee damage", "Melee Resist": "melee resist",
  "Stamina Recovery": "stamina recovery", Stamina: "stamina", "Debuff Resist": "debuff resist", "Bullet Lifesteal": "bullet lifesteal",
  "Spirit Lifesteal": "spirit lifesteal", "Move Speed": "move speed", "Health Regen": "health regen", "Ability Duration": "ability duration",
};
/** Difficulty by how common the bonus is: everyone knows health, few know Bullet Velocity. */
const statDifficulty = (members: number) => (members >= 20 ? 1 : members >= 12 ? 2 : members >= 7 ? 3 : 4);

const EFFECTS: { key: string; label: string; explanation: string; difficulty: number; re: RegExp }[] = [
  { key: "slow", label: "Slows enemies", explanation: "Its description mentions a slow.", difficulty: 2, re: /\bslow/i },
  { key: "stun", label: "Stuns enemies", explanation: "Its description mentions a stun.", difficulty: 2, re: /\bstun/i },
  { key: "silence", label: "Silences enemies", explanation: "Its description mentions a silence.", difficulty: 2, re: /\bsilenc/i },
  { key: "heal", label: "Heals", explanation: "Its description mentions healing.", difficulty: 1, re: /\bheal/i },
  { key: "barrier", label: "Gives a barrier", explanation: "Its description mentions a barrier.", difficulty: 2, re: /\bbarrier/i },
  { key: "immune", label: "Grants immunity or unstoppable", explanation: "Its description mentions immunity, invulnerability or being unstoppable.", difficulty: 3, re: /immun|unstoppable|invulnerab/i },
  { key: "disarm", label: "Disarms", explanation: "Its description mentions a disarm.", difficulty: 4, re: /\bdisarm/i },
  { key: "lifesteal", label: "Steals life", explanation: "Its description mentions lifesteal.", difficulty: 2, re: /life ?steal/i },
  { key: "reload", label: "Affects reloading", explanation: "Its description mentions reloading.", difficulty: 3, re: /\breload/i },
  { key: "dash", label: "Dashes or teleports", explanation: "Its description mentions a dash, teleport or blink.", difficulty: 3, re: /\bdash|teleport|blink/i },
  { key: "launch", label: "Launches or pulls enemies", explanation: "Its description mentions a launch, knock, lift or pull.", difficulty: 3, re: /launch|knock|airborne|\blift|\bpull/i },
  { key: "stack", label: "Stacks up", explanation: "Its description mentions stacks.", difficulty: 3, re: /\bstack/i },
  { key: "debuff", label: "Applies a debuff", explanation: "Its description mentions a debuff.", difficulty: 3, re: /debuff/i },
  { key: "melee", label: "Works with melee", explanation: "Its description mentions melee attacks.", difficulty: 3, re: /melee/i },
  { key: "ammo", label: "Gives or refills ammo", explanation: "Its description mentions ammo.", difficulty: 4, re: /\bammo/i },
  { key: "charge", label: "Has charges", explanation: "Its description mentions charges.", difficulty: 3, re: /\bcharge/i },
  { key: "stamina", label: "Affects stamina", explanation: "Its description mentions stamina.", difficulty: 3, re: /stamina/i },
  { key: "lowhp", label: "Triggers at low health", explanation: "Its description mentions a health threshold.", difficulty: 4, re: /\bbelow\b.*health|low health|% health/i },
  { key: "dot", label: "Burns, bleeds or poisons", explanation: "Its description mentions damage over time.", difficulty: 4, re: /bleed|burn|poison|damage over time/i },
  { key: "allies", label: "Helps allies", explanation: "Its description mentions allies.", difficulty: 3, re: /\ball(y|ies)\b/i },
  { key: "speed", label: "Mentions speed", explanation: "Its description mentions speed.", difficulty: 2, re: /speed/i },
];

export function deriveItemCategories(_itemsRaw: unknown[], norm: Pick<Normalized, "items">): DerivedCategory[] {
  const items = bazaarItems(norm);
  const out: DerivedCategory[] = [];
  const add = (type: "stats" | "effects", key: string, label: string, explanation: string, difficulty: number, test: Test) =>
    out.push({
      key: `item:${type}:${key}`, entity: "item", type, label, explanation, source: "derived", difficulty, vetted: true,
      members: new Map(items.map((i) => [i.id, test(i)])),
    });

  // ── stats ──
  for (const slot of ["weapon", "vitality", "spirit"] as const)
    add("stats", `slot:${slot}`, `${slot[0].toUpperCase()}${slot.slice(1)} items`, `Each is an item from the ${slot} tab of the shop.`, 1, (i) => i.slot === slot);
  add("stats", "active", "Active items", "Each item is used with a key press.", 2, (i) => i.isActive);
  add("stats", "cooldown", "Items with a cooldown", "Each item has a cooldown.", 3, (i) => i.cooldown !== null);
  add("stats", "component", "Components of other items", "Each is needed to build another item.", 3, (i) => items.some((x) => x.componentClassNames.includes(i.className)));
  add("stats", "upgrade", "Upgrades built from other items", "Each is built from one or two other items.", 2, (i) => i.componentClassNames.length > 0);
  for (const cost of [...new Set(items.map((i) => i.cost).filter((c): c is number => !!c))].sort((a, b) => a - b))
    add("stats", `cost:${cost}`, `Costs ${cost.toLocaleString("en-US")} souls`, `Each item costs ${cost.toLocaleString("en-US")} souls.`, 2, (i) => i.cost === cost);
  const labels = [...new Set(items.flatMap((i) => i.statBonuses.filter((s) => !s.conditional).map((s) => s.label)))];
  for (const label of labels) {
    const has = (i: NormItem) => i.statBonuses.some((s) => !s.conditional && s.label === label);
    const n = items.filter(has).length;
    if (n < 4) continue;
    const name = STAT_NAMES[label] ?? label.toLowerCase();
    add("stats", `bonus:${label}`, `Gives ${name}`, `Each item has ${name} among its stat bonuses.`, statDifficulty(n), has);
  }

  // ── effects ──
  for (const e of EFFECTS) add("effects", e.key, e.label, e.explanation, e.difficulty, (i) => e.re.test(i.description));
  return out;
}
