"use server";
// Per-puzzle admin actions. Hero, ability and item switches write the same site-wide exclusion lists
// that the hero/ability/item pages edit, so every view stays in sync.
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { generateDay, overridePuzzle } from "@/lib/engine/generate";
import { todayDate } from "@/lib/day";
import { LOCK_BY_SLUG } from "@/locks.config";
import { puzzlesChanged } from "@/lib/server/cache";
import { clearFuturePuzzles, rebuildFuturePuzzles, summarize } from "@/lib/admin/future";

function done() {
  updateTag("catalog");
  revalidatePath("/admin", "layout");
}

const toggle = (list: string[], mode: string, on: boolean) => {
  const rest = list.filter((m) => m !== mode);
  return on ? rest : [...rest, mode];
};

/** Put a hero, ability or item into (on) or out of (off) one mode's answer pool. */
export async function setInMode(kind: "hero" | "ability" | "item", id: string, mode: string, on: boolean) {
  await requireAdmin();
  if (kind === "hero") {
    const h = await db.hero.findUniqueOrThrow({ where: { id: Number(id) }, select: { excludeFromModes: true } });
    await db.hero.update({ where: { id: Number(id) }, data: { excludeFromModes: toggle(h.excludeFromModes, mode, on) } });
  } else if (kind === "ability") {
    const a = await db.ability.findUniqueOrThrow({ where: { id: BigInt(id) }, select: { excludeFromModes: true } });
    await db.ability.update({ where: { id: BigInt(id) }, data: { excludeFromModes: toggle(a.excludeFromModes, mode, on) } });
  } else {
    const i = await db.item.findUniqueOrThrow({ where: { id: BigInt(id) }, select: { excludeFromModes: true } });
    await db.item.update({ where: { id: BigInt(id) }, data: { excludeFromModes: toggle(i.excludeFromModes, mode, on) } });
  }
  done();
}

/** Build (or rebuild) one lock for a day. Today only when it has no playable puzzle yet. */
export async function buildDay(slug: string, date: string) {
  await requireAdmin();
  if (!LOCK_BY_SLUG[slug]) throw new Error("unknown lock");
  const today = todayDate();
  if (date < today) throw new Error("Past days stay as they were played.");
  const row = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
  if (date === today && row && !row.sealed) throw new Error("Today's puzzle is live; use an override to replace it.");
  if (date > today && row && !row.overridden) await db.dailyPuzzle.delete({ where: { id: row.id } });
  puzzlesChanged();
  const [r] = await generateDay(date, { slugs: [slug], force: date > today });
  done();
  if (r?.status !== "created") throw new Error(r?.note ?? r?.status ?? "not built");
}

/** Force a specific answer for a day (form field "answerId"). */
export async function overrideAnswer(slug: string, date: string, form: FormData) {
  await requireAdmin();
  const answerId = String(form.get("answerId") ?? "");
  if (!answerId) return;
  if (date < todayDate()) throw new Error("Past days stay as they were played.");
  await overridePuzzle(date, slug, answerId);
  done();
}

// ───────────── future days (tomorrow on) ─────────────

/** Delete future puzzles: one day and/or one lock, or everything after today. The daily job rebuilds them. */
export async function clearFuture(date?: string, slug?: string): Promise<string> {
  await requireAdmin();
  const n = await clearFuturePuzzles({ date, slugs: slug ? [slug, `${slug}-hard`] : undefined });
  done();
  return `${n} puzzle${n === 1 ? "" : "s"} removed. The daily job (14:00 UTC) rebuilds them, or use "Rebuild now".`;
}

/** Build future puzzles again from today's data: one day, or one lock on every future day. */
export async function rebuildFuture(date?: string, slug?: string): Promise<string> {
  await requireAdmin();
  if (!date && !slug) throw new Error("Pick a day or a lock (all locks on all days takes too long; clear them instead).");
  const r = await rebuildFuturePuzzles({ date, slugs: slug ? [slug, `${slug}-hard`] : undefined });
  done();
  return summarize(r);
}
