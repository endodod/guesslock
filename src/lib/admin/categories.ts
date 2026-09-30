// Saving category values from /admin/categories and the puzzle setup page.
// Hero gender/species/weapon/release keep living in their own curation fields; everything else goes to attrs.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { loadGameData, type GameData } from "../engine/context";
import type { Attrs, CellValue, ColumnDef, CompareType } from "../engine/columns";

export type Entity = "hero" | "item";
export type ValueEdit = { id: number; key: string; raw: string };

/** Parse an admin input for a column type. undefined = invalid (left unchanged). */
export function parseCell(type: CompareType, raw: string): CellValue | undefined {
  const s = raw.trim();
  if (!s) return null;
  switch (type) {
    case "numeric": {
      if (s.toLowerCase() === "none") return "none";
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? n : undefined;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    case "multi":
      return s.split(/[,/]/).map((x) => x.trim()).filter(Boolean).join(", ");
    default:
      return s;
  }
}

const same = (a: CellValue, b: CellValue) => a !== null && b !== null && String(a).toLowerCase() === String(b).toLowerCase();

// Hero built-ins backed by curation fields (not attrs).
const HERO_FIELDS: Record<string, { field: "genderOverride" | "species" | "weaponTypeOverride" | "releaseDate"; api?: (h: GameData["heroes"][number]) => CellValue }> = {
  gender: { field: "genderOverride", api: (h) => h.src.gender },
  species: { field: "species" },
  weapon: { field: "weaponTypeOverride", api: (h) => h.src.gunTag },
  release: { field: "releaseDate" },
};

/** Where a cell's value comes from: the API, an admin value, or nothing yet. */
export function cellSource(entity: Entity, col: ColumnDef<{ attrs: Attrs }>, row: { attrs: Attrs }, value: CellValue): "api" | "admin" | "missing" {
  if (value === null) return "missing";
  if (col.custom || col.key in row.attrs) return "admin";
  if (entity === "hero" && HERO_FIELDS[col.key]) {
    const api = HERO_FIELDS[col.key].api?.(row as GameData["heroes"][number]) ?? null;
    return same(api, value) ? "api" : "admin";
  }
  return "api";
}

/** Apply edits; returns how many rows changed and which inputs were invalid. */
export async function saveCategoryValues(entity: Entity, edits: ValueEdit[], data?: GameData) {
  const d = data ?? (await loadGameData());
  const cols = new Map((entity === "hero" ? d.heroColumns : d.itemColumns).map((c) => [c.key, c as ColumnDef<{ attrs: Attrs }>]));
  const invalid: string[] = [];
  const byRow = new Map<number, ValueEdit[]>();
  for (const e of edits) {
    if (!cols.has(e.key)) continue;
    if (!byRow.has(e.id)) byRow.set(e.id, []);
    byRow.get(e.id)!.push(e);
  }
  let changed = 0;
  for (const [id, list] of byRow) {
    const row = entity === "hero" ? d.hero(id) : d.item(id);
    if (!row) continue;
    const attrs: Attrs = { ...row.attrs };
    const fields: Record<string, string | Date | null> = {};
    for (const e of list) {
      const col = cols.get(e.key)!;
      const v = parseCell(col.type, e.raw);
      if (v === undefined) { invalid.push(`${row.name}: ${col.label} "${e.raw}"`); continue; }
      const heroField = entity === "hero" ? HERO_FIELDS[e.key] : undefined;
      if (heroField) {
        const api = heroField.api?.(row as GameData["heroes"][number]) ?? null;
        const keep = v === null || same(api, v) ? null : v;
        fields[heroField.field] = heroField.field === "releaseDate" ? (keep ? new Date(`${keep}T00:00:00Z`) : null) : keep === null ? null : String(keep);
        continue;
      }
      if (col.custom) {
        if (v === null) delete attrs[e.key];
        else attrs[e.key] = v;
        continue;
      }
      // Built-in API column: empty or equal to the API value clears the override.
      const api = col.get({ ...row, attrs: {} }, d);
      if (v === null || same(api, v)) delete attrs[e.key];
      else attrs[e.key] = v;
    }
    const attrsChanged = JSON.stringify(attrs) !== JSON.stringify(row.attrs);
    const current = entity === "hero" ? await db.hero.findUnique({ where: { id }, select: { genderOverride: true, species: true, weaponTypeOverride: true, releaseDate: true } }) : null;
    const fieldChanges = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => {
        const cur = (current as Record<string, unknown> | null)?.[k] ?? null;
        return cur instanceof Date ? cur.toISOString().slice(0, 10) !== (v instanceof Date ? v.toISOString().slice(0, 10) : v) : cur !== v;
      }),
    );
    if (!attrsChanged && Object.keys(fieldChanges).length === 0) continue;
    const json = attrs as Prisma.InputJsonValue;
    if (entity === "hero") await db.hero.update({ where: { id }, data: { attrs: json, ...fieldChanges } });
    else await db.item.update({ where: { id: BigInt(id) }, data: { attrs: json } });
    changed++;
  }
  return { changed, invalid };
}
