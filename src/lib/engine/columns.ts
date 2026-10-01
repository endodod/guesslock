// Attribute columns for The Reckoning (heroes) and The Appraisal (items).
// Built-in columns are defined here. /admin/categories can rename, reorder or switch them off, override single
// values (Hero/Item.attrs) and add custom categories (Category rows), merged in by resolveColumns.
import type { NormItem } from "../deadlock/types";
import type { HeroData, ItemData } from "./context";

export type CompareType = "exact" | "multi" | "numeric" | "date";
export const COMPARE_TYPES: CompareType[] = ["exact", "multi", "numeric", "date"];
export type CellValue = string | number | null;
/** Category values by column key, set in /admin/categories. */
export type Attrs = Record<string, CellValue>;

export type ColumnDef<T> = {
  key: string;
  label: string;
  info: string;
  type: CompareType;
  /** Filled by hand in /admin: the column is only used once every eligible row has a value. */
  curated?: boolean;
  get: (row: T, ctx: { buildsInto: (cls: string) => NormItem[] }) => CellValue;
  format?: (v: CellValue) => string;
  /** Switched off in /admin/categories (kept for the admin grid, never used in puzzles). */
  disabled?: boolean;
  /** Custom category (no API value). */
  custom?: boolean;
  unit?: string;
};

export type CategoryRow = {
  key: string; entity: string; label: string; info: string; type: string; unit: string;
  builtin: boolean; enabled: boolean; order: number;
};

const colKey = (row: CategoryRow) => row.key.slice(row.key.indexOf(".") + 1);

/**
 * Built-in columns with their admin settings applied, plus custom categories, in admin order.
 * Values set in attrs win over the API value; custom categories only read attrs (curated: they join once filled).
 */
export function resolveColumns<T extends { attrs: Attrs }>(entity: string, builtins: ColumnDef<T>[], rows: CategoryRow[]): ColumnDef<T>[] {
  const mine = rows.filter((r) => r.entity === entity);
  const byKey = new Map(mine.map((r) => [colKey(r), r]));
  const out: { col: ColumnDef<T>; order: number }[] = builtins.map((b, i) => {
    const r = byKey.get(b.key);
    const col: ColumnDef<T> = {
      ...b,
      label: r?.label || b.label, info: r?.info || b.info, disabled: r ? !r.enabled : false,
      get: (row, ctx) => (b.key in row.attrs ? row.attrs[b.key] : b.get(row, ctx)),
    };
    return { col, order: r?.order ?? i * 10 };
  });
  for (const r of mine) {
    if (r.builtin || builtins.some((b) => b.key === colKey(r))) continue;
    const type = (COMPARE_TYPES as string[]).includes(r.type) ? (r.type as CompareType) : "exact";
    const k = colKey(r);
    out.push({
      order: r.order,
      col: {
        key: k, label: r.label, info: r.info, type, curated: true, custom: true, disabled: !r.enabled, unit: r.unit || undefined,
        get: (row) => row.attrs[k] ?? null,
        format: type === "date" ? fmtDate : type === "numeric" && r.unit ? (v) => (v == null ? "?" : `${v} ${r.unit}`) : undefined,
      },
    });
  }
  return out.sort((a, b) => a.order - b.order).map((x) => x.col);
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (v: CellValue) => {
  if (typeof v !== "string") return "?";
  const [y, m] = v.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1]} ${y}`;
};

export const HERO_COLUMNS: ColumnDef<HeroData>[] = [
  { key: "gender", label: "Gender", info: "The hero's gender.", type: "exact", get: (h) => h.gender, format: (v) => (v ? cap(String(v)) : "?") },
  { key: "archetype", label: "Archetype", info: "Brawler, Assassin, Marksman or Mystic, as in the hero picker.", type: "exact", curated: true, get: (h) => (h.src.heroType ? cap(h.src.heroType) : null) },
  { key: "species", label: "Species", info: "What the hero is. Orange means at least one shared species.", type: "multi", curated: true, get: (h) => h.species },
  { key: "complexity", label: "Complexity", info: "In-game complexity rating (1-4 stars).", type: "exact", get: (h) => h.src.complexity, format: (v) => (v == null ? "?" : "★".repeat(Number(v))) },
  { key: "weapon", label: "Weapon", info: "Weapon type as listed in the hero picker.", type: "exact", get: (h) => h.weaponType },
  { key: "health", label: "Health", info: "Base max health at level 1. Arrows point toward the answer.", type: "numeric", get: (h) => h.src.maxHealth },
  { key: "stamina", label: "Stamina", info: "Starting stamina for dashes. Arrows point toward the answer.", type: "numeric", get: (h) => h.src.stamina },
  { key: "damage", label: "Bullet damage", info: "Base damage per bullet (per pellet for spread weapons). Arrows point toward the answer.", type: "numeric", get: (h) => h.src.bulletDamage, format: (v) => (v == null ? "?" : String(Math.round(Number(v) * 10) / 10)) },
  { key: "firerate", label: "Fire rate", info: "Base shots per second. Arrows point toward the answer.", type: "numeric", curated: true, get: (h) => h.src.fireRate ?? null, format: (v) => (v == null ? "?" : `${v}/s`) },
  { key: "release", label: "Released", info: "When the hero became playable. Arrows point toward the answer.", type: "date", curated: true, get: (h) => h.releaseDate, format: fmtDate },
];

/**
 * Columns in play: API columns always; curated columns only once every hero in the pool has a value,
 * so the lock opens without curation and gains columns as curation is completed.
 */
export function activeColumns<T>(columns: ColumnDef<T>[], pool: T[], ctx: { buildsInto: (cls: string) => NormItem[] }): ColumnDef<T>[] {
  return columns.filter((c) => !c.disabled && (!c.curated || (pool.length > 0 && pool.every((row) => c.get(row, ctx) !== null))));
}

/** Stat bonus names in tooltip order (the first one is the item's main bonus). */
const buffLabels = (i: ItemData): string[] => [...new Set(i.src.statBonuses.map((s) => s.label.replace(/[,/]/g, " ").replace(/\s+/g, " ").trim()))];

export const ITEM_COLUMNS: ColumnDef<ItemData>[] = [
  { key: "slot", label: "Slot", info: "Weapon, Vitality or Spirit.", type: "exact", get: (i) => i.src.slot, format: (v) => cap(String(v)) },
  { key: "active", label: "Type", info: "Active items are used with a key; passive items work on their own.", type: "exact", get: (i) => (i.src.isActive ? "Active" : "Passive") },
  { key: "component", label: "Component", info: "Does this item require another item as a component?", type: "exact", get: (i) => (i.src.componentClassNames.length ? "Yes" : "No") },
  { key: "buildsInto", label: "Builds into", info: "Is this item a component of another item?", type: "exact", get: (i, c) => (c.buildsInto(i.src.className).length ? "Yes" : "No") },
  { key: "cooldown", label: "Cooldown", info: "Cooldown in seconds, or none. Arrows point toward the answer.", type: "numeric", get: (i) => i.src.cooldown ?? "none", format: (v) => (v === "none" ? "None" : `${v}s`) },
  { key: "primary", label: "Primary buff", info: "The item's main stat bonus, or none.", type: "exact", get: (i) => buffLabels(i)[0] ?? "None" },
  { key: "secondary", label: "Secondary buffs", info: "The item's other stat bonuses, or none. Orange means at least one shared buff.", type: "multi", get: (i) => buffLabels(i).slice(1).join(", ") || "None" },
];

export function formatCell(col: { type: CompareType; format?: (v: CellValue) => string }, v: CellValue): string {
  if (col.format) return col.format(v);
  if (v === null || v === undefined) return "?";
  return String(v);
}
