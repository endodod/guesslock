"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { regenerateOmen } from "@/lib/engine/generate";
import { harvest } from "@/lib/omens/harvest";
import { DEFAULT_TUNING, type OmenTuning } from "@/lib/omens/scenario";
import type { Prisma } from "@/generated/prisma/client";

export async function harvestNow() {
  await requireAdmin();
  // Server actions share the function timeout: harvest for ~50 s; the rest resumes on the next run.
  const r = await harvest(Date.now() + 50_000);
  revalidatePath("/admin/omens");
  return r;
}

export async function setScenarioStatus(id: string, status: "approved" | "rejected" | "candidate") {
  await requireAdmin();
  await db.scenario.update({ where: { id }, data: { status } });
  revalidatePath("/admin/omens");
}

/** Approve the scenario already frozen into a day (keeps it; status "approved" marks the review). */
export async function approveDay(date: string, slug: string) {
  await requireAdmin();
  const row = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
  if (!row || row.sealed) throw new Error("nothing to approve");
  await db.scenario.update({ where: { id: row.answerId }, data: { status: "approved" } });
  revalidatePath("/admin/omens");
}

/** Reject the day's scenario and freeze the next best candidate instead (or fill an empty day). */
export async function regenerateDay(date: string, slug: string) {
  await requireAdmin();
  await regenerateOmen(date, slug);
  revalidatePath("/admin/omens");
}

export async function saveTuning(form: FormData) {
  await requireAdmin();
  const next: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(DEFAULT_TUNING)) {
    const raw = String(form.get(key) ?? "").trim();
    if (!raw) continue;
    if (Array.isArray(def)) {
      const [a, b] = raw.split(/[-,\s]+/).map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) next[key] = [a, b];
    } else if (Number.isFinite(Number(raw))) next[key] = Number(raw);
  }
  const value = { ...DEFAULT_TUNING, ...next } as OmenTuning;
  await db.omenConfig.upsert({
    where: { key: "tuning" },
    create: { key: "tuning", value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/admin/omens");
}
