"use server";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { saveCategoryValues, type Entity } from "@/lib/admin/categories";
import { COMPARE_TYPES, HERO_COLUMNS, ITEM_COLUMNS } from "@/lib/engine/columns";

const ENTITIES = new Set(["hero", "item"]);
const builtinsOf = (entity: string) => (entity === "hero" ? HERO_COLUMNS : ITEM_COLUMNS);

function done() {
  updateTag("catalog");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/setup", "layout");
}

/** Label, info, order and on/off for any category; type and unit for custom ones. */
export async function saveCategory(entity: string, key: string, form: FormData) {
  await requireAdmin();
  if (!ENTITIES.has(entity)) throw new Error("bad entity");
  const builtin = builtinsOf(entity).find((c) => c.key === key);
  const id = `${entity}.${key}`;
  const existing = await db.category.findUnique({ where: { key: id } });
  if (!builtin && !existing) throw new Error("unknown category");
  const type = String(form.get("type") ?? "");
  const data = {
    label: String(form.get("label") ?? "").trim() || builtin?.label || existing!.label,
    info: String(form.get("info") ?? "").trim(),
    enabled: form.get("enabled") === "on",
    order: Number(form.get("order")) || 0,
    ...(builtin ? {} : {
      type: (COMPARE_TYPES as string[]).includes(type) ? type : existing!.type,
      unit: String(form.get("unit") ?? "").trim(),
    }),
  };
  await db.category.upsert({
    where: { key: id },
    create: { key: id, entity, builtin: !!builtin, type: builtin?.type ?? data.type ?? "exact", ...data },
    update: data,
  });
  done();
}

export async function addCategory(entity: string, form: FormData) {
  await requireAdmin();
  if (!ENTITIES.has(entity)) throw new Error("bad entity");
  const label = String(form.get("label") ?? "").trim();
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!key) throw new Error("Give the category a name.");
  if (builtinsOf(entity).some((c) => c.key === key) || (await db.category.findUnique({ where: { key: `${entity}.${key}` } })))
    throw new Error(`A category "${key}" already exists.`);
  const type = String(form.get("type") ?? "exact");
  const last = await db.category.aggregate({ where: { entity }, _max: { order: true } });
  await db.category.create({
    data: {
      key: `${entity}.${key}`, entity, label, info: String(form.get("info") ?? "").trim(),
      type: (COMPARE_TYPES as string[]).includes(type) ? type : "exact", unit: String(form.get("unit") ?? "").trim(),
      builtin: false, enabled: true, order: Math.max(last._max.order ?? 0, builtinsOf(entity).length * 10) + 10,
    },
  });
  done();
}

/** Custom categories only; their values are removed from every row. */
export async function deleteCategory(entity: string, key: string) {
  await requireAdmin();
  const row = await db.category.findUnique({ where: { key: `${entity}.${key}` } });
  if (!row || row.builtin) throw new Error("Only custom categories can be deleted; switch built-in ones off instead.");
  await db.category.delete({ where: { key: row.key } });
  if (entity === "hero") await db.$executeRaw`UPDATE "Hero" SET "attrs" = "attrs" - ${key} WHERE "attrs" ? ${key}`;
  else await db.$executeRaw`UPDATE "Item" SET "attrs" = "attrs" - ${key} WHERE "attrs" ? ${key}`;
  done();
}

/** The values grid: inputs named "v|<row id>|<column key>". */
export async function saveValues(entity: string, form: FormData): Promise<string> {
  await requireAdmin();
  if (!ENTITIES.has(entity)) throw new Error("bad entity");
  const edits = [...form.entries()]
    .filter(([k]) => k.startsWith("v|"))
    .map(([k, v]) => {
      const [, id, key] = k.split("|");
      return { id: Number(id), key, raw: String(v) };
    });
  const r = await saveCategoryValues(entity as Entity, edits);
  done();
  return `${r.changed} ${entity === "hero" ? "heroes" : "items"} updated.` + (r.invalid.length ? ` Not saved (invalid): ${r.invalid.join("; ")}` : "");
}
