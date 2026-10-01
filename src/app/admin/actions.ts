"use server";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, createSession, destroySession, requireAdmin } from "@/lib/admin/auth";
import { runAssetSync, syncTexts } from "@/lib/sync/assets";
import { generateAhead, generateDay, overridePuzzle } from "@/lib/engine/generate";
import { todayDate } from "@/lib/day";
import { currentUser } from "@/lib/auth/server";
import { importAllVoiceLines, importHeroVoiceLines } from "@/lib/wiki/voicelines";
import { redact } from "@/lib/text/redact";
import { heroTerms } from "@/lib/text/entries";
import { puzzlesChanged } from "@/lib/server/cache";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// ───────────── session ─────────────

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 400)); // slow down guessing
  if (!checkPassword(String(form.get("password") ?? ""))) return "Wrong password.";
  await createSession();
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}

// ───────────── jobs ─────────────

export async function runSync() {
  await requireAdmin();
  await runAssetSync();
  updateTag("catalog");
  revalidatePath("/admin");
}

export async function runGenerate() {
  await requireAdmin();
  // Server actions share the function timeout: harvest Omens for at most ~50 s.
  await generateAhead(undefined, { harvestUntil: Date.now() + 50_000 });
  revalidatePath("/admin");
}

export async function runVoiceImportAll() {
  await requireAdmin();
  // Takes minutes (polite pacing toward the wiki): run in the background, progress is in SyncRun.
  void importAllVoiceLines().catch((e) => console.error("[voicelines]", e));
  revalidatePath("/admin");
}

export async function runVoiceImportHero(heroId: number) {
  await requireAdmin();
  const r = await importHeroVoiceLines(heroId);
  revalidatePath(`/admin/heroes/${heroId}`);
  return r;
}

// ───────────── review ─────────────

export async function markReviewed(entity: "hero" | "item" | "ability", id: number) {
  await requireAdmin();
  const data = { needsReview: false, reviewReasons: [] as string[] };
  if (entity === "hero") await db.hero.update({ where: { id }, data });
  else if (entity === "item") await db.item.update({ where: { id }, data });
  else await db.ability.update({ where: { id }, data });
  revalidatePath("/admin/review");
}

export async function markAllReviewed(entity: "item" | "ability") {
  await requireAdmin();
  const data = { needsReview: false, reviewReasons: [] as string[] };
  if (entity === "item") await db.item.updateMany({ where: { needsReview: true }, data });
  else await db.ability.updateMany({ where: { needsReview: true }, data });
  revalidatePath("/admin/review");
}

/** Accept every item currently represented in the review queue without changing its curated data. */
export async function acceptAllPendingReview() {
  await requireAdmin();
  const result = await db.$transaction(async (tx) => {
    const pendingTextCount = await tx.textEntry.count({ where: { OR: [{ status: "auto" }, { stale: true }] } });
    const [heroes, items, abilities, categories] = await Promise.all([
      tx.hero.updateMany({ where: { needsReview: true }, data: { needsReview: false, reviewReasons: [] } }),
      tx.item.updateMany({ where: { needsReview: true }, data: { needsReview: false, reviewReasons: [] } }),
      tx.ability.updateMany({ where: { needsReview: true }, data: { needsReview: false, reviewReasons: [] } }),
      tx.seanceCategory.updateMany({ where: { flagged: true }, data: { flagged: false, flagReason: null } }),
    ]);
    await tx.textEntry.updateMany({ where: { status: "auto" }, data: { status: "approved", stale: false } });
    await tx.textEntry.updateMany({ where: { stale: true }, data: { stale: false } });
    return {
      entities: heroes.count + items.count + abilities.count,
      texts: pendingTextCount,
      categories: categories.count,
    };
  });
  revalidatePath("/admin/review");
  revalidatePath("/admin/texts");
  revalidatePath("/admin/seance");
  return `Accepted ${result.entities} entities, ${result.texts} texts, and ${result.categories} Séance categories.`;
}

// ───────────── heroes ─────────────

export async function saveHero(heroId: number, form: FormData) {
  await requireAdmin();
  const release = String(form.get("releaseDate") ?? "").trim();
  await db.hero.update({
    where: { id: heroId },
    data: {
      species: String(form.get("species") ?? "").trim() || null,
      releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(release) ? new Date(release + "T00:00:00Z") : null,
      genderOverride: String(form.get("genderOverride") ?? "").trim() || null,
      weaponTypeOverride: String(form.get("weaponTypeOverride") ?? "").trim() || null,
      aliases: list(form.get("aliases")),
      excludeFromModes: form.getAll("exclude").map(String),
      ...(form.get("markReviewed") ? { needsReview: false, reviewReasons: [] } : {}),
    },
  });
  await syncTexts(); // aliases feed the redaction pass
  updateTag("catalog");
  revalidatePath(`/admin/heroes/${heroId}`);
  revalidatePath("/admin/heroes");
}

export async function saveEmojis(heroId: number, emojis: string[], reviewed: boolean) {
  await requireAdmin();
  const clean = emojis.map((e) => e.trim()).filter(Boolean).slice(0, 10);
  await db.hero.update({ where: { id: heroId }, data: { emojis: clean, emojisReviewed: reviewed && clean.length === 10 } });
  revalidatePath(`/admin/heroes/${heroId}`);
}

export async function setGenericVoice(heroId: number, generic: boolean) {
  await requireAdmin();
  await db.hero.update({ where: { id: heroId }, data: { genericVoice: generic, genericVoiceManual: true } });
  revalidatePath(`/admin/heroes/${heroId}`);
}

export async function saveAbility(abilityId: number, form: FormData) {
  await requireAdmin();
  await db.ability.update({
    where: { id: abilityId },
    data: { aliases: list(form.get("aliases")), excludeFromModes: form.getAll("exclude").map(String) },
  });
  await syncTexts();
  updateTag("catalog");
  revalidatePath("/admin", "layout");
}

// ───────────── voice lines ─────────────

export async function updateVoiceLine(id: number, patch: { status?: string; starred?: boolean; text?: string | null }) {
  await requireAdmin();
  const allowed = ["approved", "excluded", "needs_redaction", "needs_review"];
  if (patch.status && !allowed.includes(patch.status)) throw new Error("bad status");
  await db.voiceLine.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
      ...(patch.text !== undefined ? { text: patch.text?.trim() || null } : {}),
      manuallyEdited: true,
      sourceChanged: false,
    },
  });
}

/** Re-run redaction on a line with the current aliases and mark it approved. */
export async function approveRedactedLine(id: number) {
  await requireAdmin();
  const line = await db.voiceLine.findUniqueOrThrow({ where: { id }, include: { hero: { include: { abilities: true } } } });
  const { text } = redact(line.sourceText, heroTerms(line.hero, line.hero.abilities.map((a) => a.name)));
  await db.voiceLine.update({ where: { id }, data: { text, status: "approved", manuallyEdited: true, sourceChanged: false } });
  revalidatePath(`/admin/heroes/${line.heroId}`);
}

// ───────────── texts ─────────────

export async function approveText(id: number, finalText?: string) {
  await requireAdmin();
  const e = await db.textEntry.findUniqueOrThrow({ where: { id } });
  const rewritten = finalText !== undefined && finalText.trim() !== e.autoText.trim();
  await db.textEntry.update({
    where: { id },
    data: { finalText: rewritten ? finalText!.trim() : null, status: rewritten ? "rewritten" : "approved", stale: false },
  });
  revalidatePath("/admin/texts");
}

export async function approveTexts(ids: number[]) {
  await requireAdmin();
  await db.textEntry.updateMany({ where: { id: { in: ids }, status: "auto" }, data: { status: "approved", stale: false } });
  revalidatePath("/admin/texts");
}

export async function resetText(id: number) {
  await requireAdmin();
  await db.textEntry.update({ where: { id }, data: { finalText: null, status: "auto", stale: false } });
  revalidatePath("/admin/texts");
}

// ───────────── items ─────────────

export async function saveItem(itemId: number, form: FormData) {
  await requireAdmin();
  await db.item.update({
    where: { id: itemId },
    data: { aliases: list(form.get("aliases")), excludeFromModes: form.getAll("exclude").map(String) },
  });
  updateTag("catalog");
  revalidatePath("/admin/items");
}

// ───────────── calendar ─────────────

export async function overrideDay(date: string, slug: string, answerId: string) {
  await requireAdmin();
  await overridePuzzle(date, slug, answerId);
  revalidatePath("/admin/calendar");
}

/** Regenerate a future (not yet live) puzzle, e.g. after curation changes. */
export async function regenerateDay(date: string, slug: string) {
  await requireAdmin();
  if (date <= todayDate()) throw new Error("Only future days can be regenerated; use an override for today.");
  await db.dailyPuzzle.deleteMany({ where: { date, mode: slug, overridden: false } });
  puzzlesChanged();
  await generateDay(date, { slugs: [slug] });
  revalidatePath("/admin/calendar");
}

/** Fill today's sealed locks (e.g. right after curating). Never touches locks that are already live. */
export async function fillSealedToday() {
  await requireAdmin();
  await generateDay(todayDate());
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
}

/**
 * Testing: lock today's solved puzzles again for the signed-in account (the one using this browser): its recorded
 * plays for today are deleted, so every lock can be played from scratch. Other players are untouched.
 */
export async function relockToday(): Promise<string> {
  await requireAdmin();
  const user = await currentUser();
  if (!user) return "Not signed in to the game in this browser: only the local progress was reset.";
  const r = await db.play.deleteMany({ where: { userId: user.id, date: todayDate() } });
  revalidatePath("/admin");
  return `Re-locked ${r.count} puzzle${r.count === 1 ? "" : "s"} for ${user.email ?? user.name}.`;
}
