// Attribute columns for The Reckoning (heroes) and The Appraisal (items).
// Change the columns here; nothing else needs editing. Every value comes from the API or curation.
import type { NormItem } from "../deadlock/types";
import type { HeroData, ItemData } from "./context";

export type CompareType = "exact" | "multi" | "numeric" | "date";
export type CellValue = string | number | null;

export type ColumnDef<T> = {
  key: string;
  label: string;
  info: string;
  type: CompareType;
  /** Filled by hand in /admin: the column is only used once every eligible row has a value. */
  curated?: boolean;
  get: (row: T, ctx: { buildsInto: (cls: string) => NormItem[] }) => CellValue;
  format?: (v: CellValue) => string;
};

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (v: CellValue) => {
  if (typeof v !== "string") return "?";
  const [y, m] = v.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1]} ${y}`;
};

export const HERO_COLUMNS: ColumnDef<HeroData>[] = [
  { key: "gender", label: "Gender", info: "The hero's gender.", type: "exact", get: (h) => h.gender, format: (v) => (v ? cap(String(v)) : "?") },
  { key: "species", label: "Species", info: "What the hero is. Orange means at least one shared species.", type: "multi", curated: true, get: (h) => h.species },
  { key: "complexity", label: "Complexity", info: "In-game complexity rating (1-4 stars).", type: "exact", get: (h) => h.src.complexity, format: (v) => (v == null ? "?" : "★".repeat(Number(v))) },
  { key: "weapon", label: "Weapon", info: "Weapon type as listed in the hero picker.", type: "exact", get: (h) => h.weaponType },
  { key: "health", label: "Health", info: "Base max health at level 1. Arrows point toward the answer.", type: "numeric", get: (h) => h.src.maxHealth },
  { key: "dps", label: "Gun DPS", info: "Base weapon damage per second (without reloads). Arrows point toward the answer.", type: "numeric", get: (h) => h.src.dps },
  { key: "release", label: "Released", info: "When the hero became playable. Arrows point toward the answer.", type: "date", curated: true, get: (h) => h.releaseDate, format: fmtDate },
];

/**
 * Columns in play: API columns always; curated columns only once every hero in the pool has a value,
 * so the lock opens without curation and gains columns as curation is completed.
 */
export function activeColumns<T>(columns: ColumnDef<T>[], pool: T[], ctx: { buildsInto: (cls: string) => NormItem[] }): ColumnDef<T>[] {
  return columns.filter((c) => !c.curated || (pool.length > 0 && pool.every((row) => c.get(row, ctx) !== null)));
}

export const ITEM_COLUMNS: ColumnDef<ItemData>[] = [
  { key: "slot", label: "Slot", info: "Weapon, Vitality or Spirit.", type: "exact", get: (i) => i.src.slot, format: (v) => cap(String(v)) },
  { key: "tier", label: "Tier", info: "Shop tier (1-4). Arrows point toward the answer.", type: "numeric", get: (i) => i.src.tier },
  { key: "active", label: "Type", info: "Active items are used with a key; passive items work on their own.", type: "exact", get: (i) => (i.src.isActive ? "Active" : "Passive") },
  { key: "component", label: "Component", info: "Does this item require another item as a component?", type: "exact", get: (i) => (i.src.componentClassNames.length ? "Yes" : "No") },
  { key: "buildsInto", label: "Builds into", info: "Is this item a component of another item?", type: "exact", get: (i, c) => (c.buildsInto(i.src.className).length ? "Yes" : "No") },
  { key: "cooldown", label: "Cooldown", info: "Cooldown in seconds, or none. Arrows point toward the answer.", type: "numeric", get: (i) => i.src.cooldown ?? "none", format: (v) => (v === "none" ? "None" : `${v}s`) },
  { key: "stats", label: "Stat bonuses", info: "How many stat bonuses the item grants. Arrows point toward the answer.", type: "numeric", get: (i) => i.src.statBonuses.length },
];

export function formatCell(col: { type: CompareType; format?: (v: CellValue) => string }, v: CellValue): string {
  if (col.format) return col.format(v);
  if (v === null || v === undefined) return "?";
  return String(v);
}
