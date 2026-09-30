"use server";
// Puzzle setup (ADMIN_SETUP_MODE): per-hero, per-mode edits. Every action re-checks the flag and the session.
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireSetup } from "@/lib/admin/auth";
import { CUSTOM_LINE_PREFIX, parseSetup, type HeroSetup } from "@/lib/admin/setup";
import { mirror } from "@/lib/media";
import { saveCategoryValues } from "@/lib/admin/categories";
import { syncTexts } from "@/lib/sync/assets";
import { redact } from "@/lib/text/redact";
import { heroTerms } from "@/lib/text/entries";
import { MODE_OPTIONS } from "../shared";
import { EMOJI_SET_SIZE } from "@/lib/engine/modes/hero";
import { overridePuzzle } from "@/lib/engine/generate";
import { todayDate } from "@/lib/day";

const MODES = new Set<string>(MODE_OPTIONS.map(([m]) => m));
const TEXT_TYPES = new Set(["hero_lore", "ability_desc", "ability_t1", "ability_t2", "ability_t3"]);
const EMOJI_MAX = 16;

function done(heroId: number) {
  updateTag("catalog");
  revalidatePath(`/admin/setup/${heroId}`);
  revalidatePath("/admin/setup");
}

async function patchSetup(heroId: number, patch: Partial<Record<keyof HeroSetup, unknown>>) {
  const h = await db.hero.findUniqueOrThrow({ where: { id: heroId }, select: { setup: true } });
  const next = parseSetup({ ...parseSetup(h.setup), ...patch });
  await db.hero.update({ where: { id: heroId }, data: { setup: next } });
}

// ───────────── mode on/off ─────────────

export async function setHeroMode(heroId: number, mode: string, on: boolean) {
  await requireSetup();
  if (!MODES.has(mode)) throw new Error("bad mode");
  const h = await db.hero.findUniqueOrThrow({ where: { id: heroId }, select: { excludeFromModes: true } });
  const rest = h.excludeFromModes.filter((m) => m !== mode);
  await db.hero.update({ where: { id: heroId }, data: { excludeFromModes: on ? rest : [...rest, mode] } });
  done(heroId);
}

export async function setAbilityMode(heroId: number, abilityId: number, mode: string, on: boolean) {
  await requireSetup();
  if (!["ability-icon", "ability-desc", "upgrades"].includes(mode)) throw new Error("bad mode");
  const a = await db.ability.findUniqueOrThrow({ where: { id: abilityId }, select: { excludeFromModes: true, heroId: true } });
  if (a.heroId !== heroId) throw new Error("ability of another hero");
  const rest = a.excludeFromModes.filter((m) => m !== mode);
  await db.ability.update({ where: { id: abilityId }, data: { excludeFromModes: on ? rest : [...rest, mode] } });
  done(heroId);
}

// ───────────── The Reckoning ─────────────

/** Category values (inputs "v|<hero id>|<column key>") and aliases. Returns a status line. */
export async function saveAttributes(heroId: number, form: FormData): Promise<string> {
  await requireSetup();
  const edits = [...form.entries()]
    .filter(([k]) => k.startsWith(`v|${heroId}|`))
    .map(([k, v]) => ({ id: heroId, key: k.split("|")[2], raw: String(v) }));
  const r = await saveCategoryValues("hero", edits);
  const aliases = String(form.get("aliases") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const before = await db.hero.findUniqueOrThrow({ where: { id: heroId }, select: { aliases: true } });
  if (before.aliases.join("|") !== aliases.join("|")) {
    await db.hero.update({ where: { id: heroId }, data: { aliases } });
    await syncTexts(); // aliases feed the redaction pass
  }
  done(heroId);
  return r.invalid.length ? `Not saved (invalid): ${r.invalid.join("; ")}` : "Saved";
}

// ───────────── The Visage ─────────────

/** Empty URL = back to the API card. A new URL is mirrored first, so a bad link fails here, not in a puzzle. */
export async function saveSplash(heroId: number, form: FormData): Promise<string | null> {
  await requireSetup();
  const url = String(form.get("splash") ?? "").trim();
  if (url) {
    if (!/^https?:\/\//.test(url)) return "Use an http(s) image URL.";
    const id = await mirror(url);
    if (!id) return "Couldn't download that image.";
    const asset = await db.mirroredAsset.findUnique({ where: { id }, select: { contentType: true } });
    if (!asset?.contentType.startsWith("image/")) return "That URL isn't an image.";
  }
  await patchSetup(heroId, { splash: url || undefined });
  done(heroId);
  return null;
}

// ───────────── texts (Testament, Incantation, Ascension) ─────────────

/** Rewrite a clue text; empty = back to the automatic redaction. */
export async function saveClueText(heroId: number, entityType: string, entityId: number, form: FormData) {
  await requireSetup();
  if (!TEXT_TYPES.has(entityType)) throw new Error("bad text type");
  const text = String(form.get("text") ?? "").trim();
  const e = await db.textEntry.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
  if (!e) {
    if (!text) return;
    await db.textEntry.create({
      data: { entityType, entityId, sourceText: "", sourceHash: "", autoText: "", finalText: text, status: "rewritten" },
    });
  } else if (!text || text === e.autoText.trim()) {
    await db.textEntry.update({ where: { id: e.id }, data: { finalText: null, status: "approved", stale: false } });
  } else {
    await db.textEntry.update({ where: { id: e.id }, data: { finalText: text, status: "rewritten", stale: false } });
  }
  revalidatePath("/admin/texts");
  done(heroId);
}

// ───────────── The Belongings ─────────────

export async function saveBuildItems(heroId: number, pin: string[], ban: string[]) {
  await requireSetup();
  const known = new Set((await db.item.findMany({ where: { active: true }, select: { className: true } })).map((i) => i.className));
  const clean = (l: string[]) => [...new Set(l.filter((c) => known.has(c)))];
  const pins = clean(pin);
  await patchSetup(heroId, { buildPin: pins, buildBan: clean(ban).filter((c) => !pins.includes(c)) });
  done(heroId);
}

// ───────────── The Cipher ─────────────

export async function saveEmojiList(heroId: number, emojis: string[]) {
  await requireSetup();
  const clean = emojis.map((e) => e.trim()).filter(Boolean).slice(0, EMOJI_MAX);
  await db.hero.update({ where: { id: heroId }, data: { emojis: clean, emojisReviewed: clean.length >= EMOJI_SET_SIZE } });
  done(heroId);
}

// ───────────── The Echo ─────────────

export async function addVoiceLine(heroId: number, form: FormData) {
  await requireSetup();
  const text = String(form.get("text") ?? "").trim();
  if (!text) return;
  const hero = await db.hero.findUniqueOrThrow({ where: { id: heroId }, include: { abilities: true } });
  const { text: autoText } = redact(text, heroTerms(hero, hero.abilities.map((a) => a.name)));
  await db.voiceLine.create({
    data: {
      heroId, wikiPage: "", revisionId: 0, section: "Custom", fileName: `${CUSTOM_LINE_PREFIX}${Date.now().toString(36)}`,
      sourceText: text, sourceHash: "", autoText, wordCount: text.split(/\s+/).length,
      status: "approved", starred: form.get("starred") === "on", manuallyEdited: true,
    },
  });
  done(heroId);
}

export async function editVoiceLine(heroId: number, lineId: number, form: FormData) {
  await requireSetup();
  const line = await db.voiceLine.findUniqueOrThrow({ where: { id: lineId } });
  if (line.heroId !== heroId) throw new Error("line of another hero");
  const text = String(form.get("text") ?? "").trim();
  await db.voiceLine.update({
    where: { id: lineId },
    data: { text: text && text !== line.autoText.trim() ? text : null, starred: form.get("starred") === "on", status: "approved", manuallyEdited: true, sourceChanged: false },
  });
  done(heroId);
}

/** Custom lines are deleted; imported lines are excluded (a re-import would bring them back otherwise). */
export async function removeVoiceLine(heroId: number, lineId: number) {
  await requireSetup();
  const line = await db.voiceLine.findUniqueOrThrow({ where: { id: lineId } });
  if (line.heroId !== heroId) throw new Error("line of another hero");
  if (line.fileName.startsWith(CUSTOM_LINE_PREFIX)) await db.voiceLine.delete({ where: { id: lineId } });
  else await db.voiceLine.update({ where: { id: lineId }, data: { status: "excluded", manuallyEdited: true, sourceChanged: false } });
  done(heroId);
}

export async function restoreVoiceLine(heroId: number, lineId: number) {
  await requireSetup();
  const line = await db.voiceLine.findUniqueOrThrow({ where: { id: lineId } });
  if (line.heroId !== heroId) throw new Error("line of another hero");
  await db.voiceLine.update({ where: { id: lineId }, data: { status: "approved", manuallyEdited: true, sourceChanged: false } });
  done(heroId);
}

export async function setEchoVoice(heroId: number, generic: boolean) {
  await requireSetup();
  await db.hero.update({ where: { id: heroId }, data: { genericVoice: generic, genericVoiceManual: true } });
  done(heroId);
}

// ───────────── generated days ─────────────

/** Rebuild an upcoming day that uses this hero with the current setup (same answer). */
export async function rebuildDay(heroId: number, date: string, slug: string, answerId: string) {
  await requireSetup();
  if (date <= todayDate()) throw new Error("Only upcoming days can be rebuilt; today's puzzle may already be in play.");
  await overridePuzzle(date, slug, answerId);
  revalidatePath("/admin/calendar");
  done(heroId);
}
