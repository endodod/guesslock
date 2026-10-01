// Raw API payloads -> validated, filtered, normalized entities.
import {
  AbilitySchema, HeroRawSchema, UpgradeSchema, WeaponSchema,
  type AbilityRaw, type PropertyRaw,
} from "./schemas";
import type { AbilityStat, NormAbility, NormHero, NormItem, StatBonus } from "./types";
import { formatValue, renderTemplate } from "../text/render";

export type SyncIssue = { entity: string; id: string; reason: string };

export type Normalized = {
  heroes: NormHero[];
  abilities: NormAbility[];
  items: NormItem[];
  issues: SyncIssue[];
};

const SIGNATURE_KEYS = ["signature1", "signature2", "signature3", "signature4"] as const;

export function isEligibleHero(h: {
  player_selectable?: boolean | null; disabled?: boolean | null; in_development?: boolean | null;
  class_name: string; prerelease_only?: boolean | null; limited_testing?: boolean | null;
  assigned_players_only?: boolean | null; needs_testing?: boolean | null;
}): boolean {
  if (!h.player_selectable) return false;
  if (h.disabled || h.in_development || h.prerelease_only || h.assigned_players_only) return false;
  if (/test/i.test(h.class_name)) return false;
  return true;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

/** Build a T1..T3 upgrade text from property_upgrades when the API has no pre-rendered tN_desc. */
function synthesizeTier(ability: AbilityRaw, tierIndex: number): string | null {
  const ups = ability.upgrades?.[tierIndex]?.property_upgrades ?? [];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const u of ups) {
    const bonus = num(u.bonus);
    if (bonus === null || bonus === 0) continue;
    const prop = ability.properties?.[u.name];
    const label = prop?.label || humanize(u.name);
    if (seen.has(label)) continue;
    seen.add(label);
    const value = formatValue(bonus, {
      postfix: prop?.postfix ?? "", units: prop?.display_units ?? undefined, signed: true,
    });
    parts.push(`${value} ${label}`);
  }
  return parts.length ? parts.join("\n") : null;
}

export function normalizeAll(heroesRaw: unknown[], itemsRaw: unknown[]): Normalized {
  const issues: SyncIssue[] = [];
  const itemsByClass = new Map<string, Record<string, unknown>>();
  for (const it of itemsRaw) {
    const o = it as Record<string, unknown>;
    if (o && typeof o.class_name === "string") itemsByClass.set(o.class_name, o);
  }

  // Heroes + their abilities
  const heroes: NormHero[] = [];
  const abilities: NormAbility[] = [];
  for (const raw of heroesRaw) {
    const parsed = HeroRawSchema.safeParse(raw);
    const rid = String((raw as { id?: unknown })?.id ?? "?");
    if (!parsed.success) {
      issues.push({ entity: "hero", id: rid, reason: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") });
      continue;
    }
    const h = parsed.data;
    if (!isEligibleHero(h)) continue;

    const weapon = WeaponSchema.safeParse(itemsByClass.get(h.items.weapon_primary ?? ""));
    const w = weapon.success ? weapon.data.weapon_info : null;
    const heroAbilities: NormAbility[] = [];
    SIGNATURE_KEYS.forEach((key, i) => {
      const cls = h.items[key];
      const a = AbilitySchema.safeParse(itemsByClass.get(cls ?? ""));
      if (!cls || !a.success || !a.data.name) {
        issues.push({ entity: "ability", id: `${h.name}/${key}`, reason: a.success ? "missing name" : "missing or invalid ability" });
        return;
      }
      const d = a.data.description ?? {};
      const vars = { hero_name: "[this hero]" };
      const tierText = (idx: number) => {
        const pre = [d.t1_desc, d.t2_desc, d.t3_desc][idx];
        const rendered = pre ? renderTemplate(pre, vars) : "";
        return rendered || synthesizeTier(a.data, idx);
      };
      heroAbilities.push({
        id: a.data.id,
        className: a.data.class_name,
        name: a.data.name,
        heroId: h.id,
        slot: i + 1,
        image: a.data.image ?? null,
        description: renderTemplate(d.desc ?? "", vars),
        quip: d.quip ? renderTemplate(d.quip, vars) : null,
        tiers: [tierText(0), tierText(1), tierText(2)],
        stats: abilityStats(a.data),
      });
    });

    heroes.push({
      id: h.id,
      className: h.class_name,
      name: h.name,
      gender: h.gender ?? null,
      heroType: h.hero_type ?? null,
      complexity: h.complexity ?? null,
      gunTag: h.gun_tag ?? null,
      tags: h.tags ?? [],
      lore: h.description?.lore ? renderTemplate(h.description.lore) : null,
      role: h.description?.role ?? null,
      playstyle: h.description?.playstyle ?? null,
      images: {
        card: h.images?.icon_hero_card ?? null,
        small: h.images?.icon_image_small ?? null,
        vertical: h.images?.top_bar_vertical_image ?? null,
        gloat: h.images?.hero_card_gloat ?? null,
      },
      maxHealth: h.starting_stats?.max_health?.value ?? null,
      stamina: h.starting_stats?.stamina?.value ?? null,
      bulletDamage: w?.bullet_damage ?? null,
      fireRate: w?.cycle_time ? Math.round(10 / w.cycle_time) / 10 : null,
      dps: w?.damage_per_second != null ? Math.round(w.damage_per_second * 10) / 10 : null,
      abilityClassNames: heroAbilities.map((a) => a.className),
    });
    abilities.push(...heroAbilities);
  }

  // Shop items
  const items: NormItem[] = [];
  for (const raw of itemsRaw) {
    const o = raw as Record<string, unknown>;
    if (o?.type !== "upgrade") continue;
    const parsed = UpgradeSchema.safeParse(raw);
    if (!parsed.success) {
      // Non-slot upgrades (e.g. hero-specific or internal) fail the slot enum; only report real items.
      if (["weapon", "vitality", "spirit"].includes(String(o.item_slot_type)))
        issues.push({ entity: "item", id: String(o.id), reason: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") });
      continue;
    }
    const it = parsed.data;
    if (it.disabled || it.shopable === false) continue;
    items.push({
      id: it.id,
      className: it.class_name,
      name: it.name,
      slot: it.item_slot_type,
      tier: it.item_tier,
      cost: it.cost ?? null,
      activation: it.activation ?? null,
      isActive: !!it.is_active_item,
      componentClassNames: it.component_items ?? [],
      image: it.shop_image ?? it.image ?? null,
      glyph: it.image ?? null,
      cooldown: (() => {
        const cd = num(it.properties?.AbilityCooldown?.value);
        return cd && cd > 0 ? cd : null;
      })(),
      statBonuses: extractStatBonuses(it.tooltip_sections ?? [], it.properties ?? {}),
      description: renderTemplate(it.description?.desc ?? ""),
    });
  }

  return { heroes, abilities, items, issues };
}

function extractStatBonuses(
  sections: NonNullable<ReturnType<typeof UpgradeSchema.parse>["tooltip_sections"]>,
  props: Record<string, PropertyRaw>,
): StatBonus[] {
  const out: StatBonus[] = [];
  const innate = sections.filter((s) => s.section_type === "innate");
  for (const s of innate)
    for (const attr of s.section_attributes ?? [])
      for (const key of [...(attr.elevated_properties ?? []), ...(attr.properties ?? [])]) {
        const p = props[key];
        const value = num(p?.value);
        if (!p || value === null || value === 0 || !p.label) continue;
        const conditional = !!p.conditional || (p.usage_flags ?? []).includes("ConditionallyApplied");
        out.push({
          key,
          label: p.label,
          value,
          display: formatValue(value, { prefix: p.prefix ?? "", postfix: p.postfix ?? "", units: p.display_units ?? undefined }),
          prefix: p.prefix ?? "",
          postfix: p.postfix ?? (p.display_units === "EDisplayUnit_Meters" ? "m" : ""),
          conditional,
          scales: !!p.scale_function,
        });
      }
  return out;
}

/** Always part of The Calculus when set: the stats every ability card shows. */
const BASE_ABILITY_STATS = ["AbilityCooldown", "AbilityCastRange", "AbilityDuration", "AbilityCharges"];

/**
 * An ability's numeric stats: the properties its in-game tooltip lists, then cooldown, cast range, duration and charges.
 * Only labelled, finite, non-zero values; one entry per label (the first wins), conditional values included as shown in game.
 */
export function abilityStats(a: Pick<AbilityRaw, "properties" | "tooltip_details">): AbilityStat[] {
  const keys: string[] = [];
  for (const s of a.tooltip_details?.info_sections ?? []) {
    keys.push(...(s.basic_properties ?? []));
    for (const b of s.properties_block ?? []) for (const p of b.properties ?? []) if (p.important_property) keys.push(p.important_property);
  }
  keys.push(...BASE_ABILITY_STATS);
  const out: AbilityStat[] = [];
  const labels = new Set<string>();
  for (const key of new Set(keys)) {
    const p = a.properties?.[key];
    const value = num(p?.value);
    const label = p?.label?.trim();
    if (!p || !label || value === null || value === 0 || labels.has(label.toLowerCase())) continue;
    labels.add(label.toLowerCase());
    out.push({ key, label, value, display: formatValue(value, { prefix: p.prefix ?? "", postfix: p.postfix ?? "", units: p.display_units ?? undefined }) });
  }
  return out;
}

/** Item classNames that list `className` as a component. */
export function buildsInto(items: NormItem[], className: string): NormItem[] {
  return items.filter((i) => i.componentClassNames.includes(className));
}
