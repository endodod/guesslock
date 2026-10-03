"use server";
// Player reports: mark them fixed or dismissed, or apply a reported fix to a category value directly.
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { saveCategoryValues } from "@/lib/admin/categories";
import { loadGameData } from "@/lib/engine/context";

const STATUSES = new Set(["open", "fixed", "dismissed"]);

export async function setFeedbackStatus(id: number, status: string): Promise<string> {
  await requireAdmin();
  if (!STATUSES.has(status)) throw new Error("bad status");
  await db.feedback.update({ where: { id }, data: { status } });
  revalidatePath("/admin/feedback");
  return status === "open" ? "Reopened." : `Marked ${status}.`;
}

export async function saveFeedbackNote(id: number, form: FormData) {
  await requireAdmin();
  await db.feedback.update({ where: { id }, data: { adminNote: String(form.get("note") ?? "").trim().slice(0, 2000) || null } });
  revalidatePath("/admin/feedback");
}

/** Hero or item category reports with a suggested value: write it (as the data grid would) and mark the report fixed. */
export async function applyFeedbackFix(id: number): Promise<string> {
  await requireAdmin();
  const f = await db.feedback.findUnique({ where: { id } });
  if (!f || f.kind !== "data" || !f.suggested || !f.field || f.entityId === null) throw new Error("Nothing to apply.");
  if (f.entity !== "hero" && f.entity !== "item") throw new Error("Only hero and item categories can be applied here; fix this one by hand.");
  const data = await loadGameData();
  const cols = f.entity === "hero" ? data.heroColumns : data.itemColumns;
  if (!cols.some((c) => c.key === f.field)) throw new Error(`"${f.fieldLabel}" is not a category; fix it by hand.`);
  const r = await saveCategoryValues(f.entity, [{ id: f.entityId, key: f.field, raw: f.suggested }], data);
  if (r.invalid.length) throw new Error(`Not saved: ${r.invalid.join("; ")}`);
  await db.feedback.update({ where: { id }, data: { status: "fixed", adminNote: [f.adminNote, `Applied "${f.suggested}".`].filter(Boolean).join(" ") } });
  updateTag("catalog");
  revalidatePath("/admin", "layout");
  return r.changed ? `Applied. Rebuild the future puzzles to use it (Puzzles page).` : "Already set to that value; marked fixed.";
}
