"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate } from "@/lib/day";
import { buildSeanceBoard, saveSeanceBoard } from "@/lib/seance/library";
import { generateDay } from "@/lib/engine/generate";
import { CATEGORY_TYPES, type CategoryType } from "@/lib/seance/types";

const STATUSES = ["draft", "approved", "retired"];
const clampDifficulty = (v: FormDataEntryValue | null) => Math.min(4, Math.max(1, Number(v) || 2));

function revalidate(id?: number) {
  revalidatePath("/admin/seance");
  revalidatePath("/admin/review");
  if (id) revalidatePath(`/admin/seance/${id}`);
}

/** New curated category (visuals, lore, or a hand-made mechanics one): starts as a draft with no memberships. */
export async function createCategory(form: FormData) {
  await requireAdmin();
  const type = String(form.get("type")) as CategoryType;
  const label = String(form.get("label") ?? "").trim();
  if (!CATEGORY_TYPES.includes(type) || !label) throw new Error("type and label are required");
  const c = await db.seanceCategory.create({
    data: {
      type, label, explanation: String(form.get("explanation") ?? "").trim() || null,
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
      ...(c.source === "curated" && CATEGORY_TYPES.includes(type) ? { type } : {}),
    },
  });
  revalidate(id);
}

/** One hero's membership: yes / no (an admin decision, kept across syncs) or back to unknown. */
export async function setMembership(categoryId: number, heroId: number, value: boolean | null) {
  await requireAdmin();
  if (value === null) await db.seanceMembership.deleteMany({ where: { categoryId, heroId } });
  else
    await db.seanceMembership.upsert({
      where: { categoryId_heroId: { categoryId, heroId } },
      create: { categoryId, heroId, member: value, source: "admin" },
      update: { member: value, source: "admin" },
    });
  await db.seanceCategory.update({ where: { id: categoryId }, data: { updatedAt: new Date() } });
  revalidate(categoryId);
}

/** Bulk: every active hero without a membership gets `value` (e.g. "everyone else: no"). */
export async function fillUnknown(categoryId: number, value: boolean) {
  await requireAdmin();
  const [heroes, rows] = await Promise.all([
    db.hero.findMany({ where: { active: true }, select: { id: true } }),
    db.seanceMembership.findMany({ where: { categoryId }, select: { heroId: true } }),
  ]);
  const have = new Set(rows.map((r) => r.heroId));
  await db.seanceMembership.createMany({
    data: heroes.filter((h) => !have.has(h.id)).map((h) => ({ categoryId, heroId: h.id, member: value, source: "admin" })),
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
export async function applyBoard(date: string, table: string, reroll: number) {
  await requireAdmin();
  const lock = LOCKS.find((l) => l.box === "seance" && l.table?.kind === table);
  if (!lock) throw new Error("unknown table");
  const r = await buildSeanceBoard(lock, date, reroll);
  if (!r.ok) throw new Error(r.reason);
  await saveSeanceBoard(date, lock.slug, r.payload, true);
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/seance/preview");
}

/** Back to the automatic board for a future day (drops an override). */
export async function resetBoard(date: string, table: string) {
  await requireAdmin();
  if (date <= todayDate()) throw new Error("Only future days can be reset; live days keep their board.");
  const lock = LOCKS.find((l) => l.box === "seance" && l.table?.kind === table);
  if (!lock) throw new Error("unknown table");
  await db.dailyPuzzle.deleteMany({ where: { date, mode: lock.slug } });

  await generateDay(date, { slugs: [lock.slug] });
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/seance/preview");
}
