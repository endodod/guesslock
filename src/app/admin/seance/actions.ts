"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { SEANCE_LOCKS, type SeanceEntity } from "@/locks.config";
import { todayDate } from "@/lib/day";
import { activeEntities, buildSeanceBoard, saveSeanceBoard } from "@/lib/seance/library";
import { generateDay } from "@/lib/engine/generate";
import { ENTITY_TYPES, type CategoryType } from "@/lib/seance/types";
import { puzzlesChanged } from "@/lib/server/cache";

const STATUSES = ["draft", "approved", "retired"];
const clampDifficulty = (v: FormDataEntryValue | null) => Math.min(4, Math.max(1, Number(v) || 2));

function revalidate(id?: number) {
  revalidatePath("/admin/seance");
  revalidatePath("/admin/review");
  if (id) revalidatePath(`/admin/seance/${id}`);
}

const ENTITIES: SeanceEntity[] = ["hero", "item", "ability"];

/** New curated category (looks, lore, or a hand-made one): starts as a draft with no memberships. */
export async function createCategory(form: FormData) {
  await requireAdmin();
  const entity = String(form.get("entity") ?? "hero") as SeanceEntity;
  const type = String(form.get("type")) as CategoryType;
  const label = String(form.get("label") ?? "").trim();
  if (!ENTITIES.includes(entity) || !ENTITY_TYPES[entity].includes(type) || !label) throw new Error("entity, a type of that entity and a label are required");
  const c = await db.seanceCategory.create({
    data: {
      entity, type, label, explanation: String(form.get("explanation") ?? "").trim() || null,
      source: "curated", difficulty: clampDifficulty(form.get("difficulty")), status: "draft",
    },
  });
  revalidate();
  redirect(`/admin/seance/${c.id}`);
}

export async function saveCategory(id: number, form: FormData) {
  await requireAdmin();
  const status = String(form.get("status") ?? "draft");
  const type = String(form.get("type") ?? "") as CategoryType;
  const c = await db.seanceCategory.findUniqueOrThrow({ where: { id } });
  await db.seanceCategory.update({
    where: { id },
    data: {
      label: String(form.get("label") ?? c.label).trim() || c.label,
      explanation: String(form.get("explanation") ?? "").trim() || null,
      difficulty: clampDifficulty(form.get("difficulty")),
      status: STATUSES.includes(status) ? status : c.status,
      // API-derived categories are always mechanics; curated ones may move between types.
      ...(c.source === "curated" && ENTITY_TYPES[c.entity as SeanceEntity]?.includes(type) ? { type } : {}),
    },
  });
  revalidate(id);
}

/** One entity's membership: yes / no (an admin decision, kept across syncs) or back to unknown. */
export async function setMembership(categoryId: number, entityNumber: number, value: boolean | null) {
  await requireAdmin();
  const entityId = BigInt(entityNumber);
  if (value === null) await db.seanceMembership.deleteMany({ where: { categoryId, entityId } });
  else
    await db.seanceMembership.upsert({
      where: { categoryId_entityId: { categoryId, entityId } },
      create: { categoryId, entityId, member: value, source: "admin" },
      update: { member: value, source: "admin" },
    });
  await db.seanceCategory.update({ where: { id: categoryId }, data: { updatedAt: new Date() } });
  revalidate(categoryId);
}

/** Bulk: every active entity of the category's kind without a membership gets `value` (e.g. "everyone else: no"). */
export async function fillUnknown(categoryId: number, value: boolean) {
  await requireAdmin();
  const c = await db.seanceCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const [entities, rows] = await Promise.all([
    activeEntities(c.entity as SeanceEntity),
    db.seanceMembership.findMany({ where: { categoryId }, select: { entityId: true } }),
  ]);
  const have = new Set(rows.map((r) => Number(r.entityId)));
  await db.seanceMembership.createMany({
    data: entities.filter((e) => !have.has(e.id)).map((e) => ({ categoryId, entityId: BigInt(e.id), member: value, source: "admin" })),
    skipDuplicates: true,
  });
  revalidate(categoryId);
}

export async function setStatus(id: number, status: "draft" | "approved" | "retired") {
  await requireAdmin();
  await db.seanceCategory.update({ where: { id }, data: { status, ...(status !== "draft" ? { flagged: false, flagReason: null } : {}) } });
  revalidate(id);
}

/** The sync's membership change was looked at: clear the flag (the members already follow the API). */
export async function clearFlag(id: number) {
  await requireAdmin();
  await db.seanceCategory.update({ where: { id }, data: { flagged: false, flagReason: null } });
  revalidate(id);
}

export async function deleteCategory(id: number) {
  await requireAdmin();
  const c = await db.seanceCategory.findUniqueOrThrow({ where: { id } });
  // Derived categories come back on the next sync; retire them instead.
  if (c.source !== "curated") throw new Error("API-derived categories can't be deleted; retire them instead.");
  await db.seanceCategory.delete({ where: { id } });
  revalidate();
  redirect("/admin/seance");
}

/** Board preview → the day's puzzle ("Use this board"): an override that sticks, like the calendar's. */
export async function applyBoard(date: string, slug: string, reroll: number) {
  await requireAdmin();
  const lock = SEANCE_LOCKS.find((l) => l.slug === slug);
  if (!lock) throw new Error("unknown table");
  const r = await buildSeanceBoard(lock, date, reroll);
  if (!r.ok) throw new Error(r.reason);
  await saveSeanceBoard(date, lock.slug, r.payload, true);
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/seance/preview");
}

/** Back to the automatic board for a future day (drops an override). */
export async function resetBoard(date: string, slug: string) {
  await requireAdmin();
  if (date <= todayDate()) throw new Error("Only future days can be reset; live days keep their board.");
  const lock = SEANCE_LOCKS.find((l) => l.slug === slug);
  if (!lock) throw new Error("unknown table");
  await db.dailyPuzzle.deleteMany({ where: { date, mode: lock.slug } });
  puzzlesChanged();

  await generateDay(date, { slugs: [lock.slug] });
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/seance/preview");
}
