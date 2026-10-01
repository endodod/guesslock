// The Echo family (select lines, ability cast lines, conversations) from a hero's wiki voice-line page.
// Parsers are pure (unit-tested); importHeroVoice() stores the result in VoiceEntry.
// Wiki text is CC BY-NC-SA 4.0 (see the credit in the rules popover).
import { db } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { heroTerms } from "../text/entries";
import { normalize } from "../text/normalize";
import { redact } from "../text/redact";
import { cleanWikiText, fetchPage, sleep } from "./voicelines";

export type AudioEntry = { file: string; text: string };
export type CastEntry = AudioEntry & { ability: string };
export type ConvoLine = { speaker: string; text: string };
export type ConvoEntry = { other: string; complete: boolean; lines: ConvoLine[]; key: string };

const AUDIO = /\{\{Audio link\|([^|}]+)\|([^}]*)\}\}/;

/** The text of a level-2 section (`== Name ==`), up to the next level-2 heading. */
export function sectionOf(wikitext: string, name: string): string {
  const re = new RegExp(`^==\\s*${name}\\s*==\\s*$`, "m");
  const m = re.exec(wikitext);
  if (!m) return "";
  const rest = wikitext.slice(m.index + m[0].length);
  const next = /^==[^=].*==\s*$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Cells of a wikitable row: every line starting with "|" opens a cell, other lines continue it. */
function cellsOf(rowLines: string[]): string[] {
  const cells: string[] = [];
  for (const line of rowLines) {
    if (line.startsWith("|")) cells.push(line.slice(1).replace(/^[^|{[]*=[^|]*\|/, ""));
    else if (!line.startsWith("!") && cells.length) cells[cells.length - 1] += "\n" + line;
  }
  return cells;
}

/** Table rows split on "|-" (and the table end), without the header lines. */
function rowsOf(block: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("|-") || line.startsWith("|}") || line.startsWith("{|")) {
      if (cur.length) rows.push(cur);
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) rows.push(cur);
  return rows;
}

const CJK = /[぀-ヿ㐀-鿿]/;
const TRANSLATION = /''[(]([^)]*)[)]''/;

/** English text of a line: foreign-language lines (Yamato) use the translation next to them. */
function englishOf(rawLine: string, translation?: string): string {
  const text = cleanWikiText(rawLine);
  if (!CJK.test(text)) return text;
  const inline = TRANSLATION.exec(rawLine)?.[1];
  const t = cleanWikiText(inline ?? translation ?? "");
  return t && !CJK.test(t) ? t : "";
}

/** The audio entry of a table row: the cell with the Audio link and the cell after it (a translation, if any). */
function audioOf(cells: string[]): { idx: number; file: string; text: string } | null {
  const idx = cells.findIndex((c) => AUDIO.test(c));
  if (idx < 0) return null;
  const m = AUDIO.exec(cells[idx])!;
  const text = englishOf(m[2], cells[idx + 1]);
  return text ? { idx, file: m[1].trim(), text } : null;
}

export function parseSelect(wikitext: string): AudioEntry[] {
  const out: AudioEntry[] = [];
  for (const row of rowsOf(sectionOf(wikitext, "Select"))) {
    const a = audioOf(cellsOf(row).map((c) => c.trim()));
    if (a) out.push({ file: a.file, text: a.text });
  }
  return out;
}

/** "Use" lines of every ability (what the hero says when casting it). */
export function parseCastLines(wikitext: string): CastEntry[] {
  const out: CastEntry[] = [];
  const parts = sectionOf(wikitext, "Abilities").split(/^===\s*\{\{AbilityIcon\|([^}|]+)[^}]*\}\}\s*===\s*$/m);
  // split() with a capture group: [before, name1, body1, name2, body2, …]
  for (let i = 1; i < parts.length; i += 2) {
    const ability = parts[i].trim();
    let context = "";
    for (const row of rowsOf(parts[i + 1] ?? "")) {
      const cells = cellsOf(row).map((c) => c.trim());
      const a = audioOf(cells);
      if (!a) continue;
      // The context cell sits right before the audio (after an optional character column); later rows of a rowspan have none.
      if (a.idx >= 1) context = cleanWikiText(cells[a.idx - 1]);
      if (context === "Use") out.push({ ability, file: a.file, text: a.text });
    }
  }
  return out;
}

const HERO_ICON = /\{\{HeroIcon\|([^|}]+)[^}]*\}\}/;

/** Conversations of the page's hero: only complete ones (every line has audio on the wiki). */
export function parseConvos(wikitext: string): ConvoEntry[] {
  const section = sectionOf(wikitext, "Conversations");
  const start = section.indexOf("!Complete?");
  if (start < 0) return [];
  const out: ConvoEntry[] = [];
  let other = "";
  let complete = false;
  for (const row of rowsOf(section.slice(start))) {
    for (const cell of cellsOf(row).map((c) => c.trim())) {
      const icon = /^\{\{HeroIcon\|([^|}]+)\}\}$/.exec(cell);
      const flag = /^(?:\{\{Audio link\|[^|}]*\|)?(Yes|No)(?:\}\})?$/i.exec(cell);
      if (icon) other = icon[1].trim();
      else if (flag) complete = flag[1].toLowerCase() === "yes";
      else if (cell) {
        const lines: ConvoLine[] = [];
        let key = "";
        for (const l of cell.split("\n")) {
          const who = HERO_ICON.exec(l);
          if (!who) continue;
          const audio = AUDIO.exec(l);
          if (audio && !key) key = audio[1].trim();
          const text = englishOf(audio ? audio[2] : l.replace(HERO_ICON, ""));
          if (text) lines.push({ speaker: who[1].trim(), text });
        }
        if (other && complete && lines.length >= 2 && key) out.push({ other, complete, lines, key });
      }
    }
  }
  return out;
}

// ───────────── import ─────────────

type HeroRow = { id: number; name: string; className: string; aliases: string[]; abilities: { id: bigint; name: string; slot: number; aliases: string[] }[] };

export type VoiceImport = { hero: string; status: "ok" | "missing" | "error"; select?: number; cast?: number; convos?: number; note?: string };

export function planVoiceEntries(wikitext: string, hero: HeroRow, heroes: Pick<HeroRow, "id" | "name">[]): Prisma.VoiceEntryCreateManyInput[] {
  const own = heroTerms(hero, hero.abilities.map((a) => a.name));
  const blank = (t: string) => redact(t, own).text;
  const rows: Prisma.VoiceEntryCreateManyInput[] = [];
  for (const l of parseSelect(wikitext)) rows.push({ heroId: hero.id, kind: "select", fileKey: l.file, text: blank(l.text) });
  const byName = new Map(hero.abilities.flatMap((a) => [a.name, ...a.aliases].map((n) => [normalize(n), a] as const)));
  for (const l of parseCastLines(wikitext)) {
    const a = byName.get(normalize(l.ability));
    if (a) rows.push({ heroId: hero.id, kind: "cast", fileKey: l.file, abilityId: a.id, abilitySlot: a.slot, text: blank(l.text) });
  }
  const idOf = new Map(heroes.map((h) => [normalize(h.name), h.id]));
  for (const c of parseConvos(wikitext)) {
    const otherId = idOf.get(normalize(c.other));
    const ids = c.lines.map((l) => idOf.get(normalize(l.speaker)));
    // Both sides must be known heroes and the page's hero must speak at least once.
    if (otherId === undefined || ids.includes(undefined) || !ids.includes(hero.id)) continue;
    rows.push({
      heroId: hero.id, kind: "convo", fileKey: c.key, otherHeroId: otherId,
      lines: c.lines.map((l, i) => ({ h: ids[i]!, t: blank(l.text) })),
    });
  }
  return rows;
}

export async function importHeroVoice(heroId: number): Promise<VoiceImport> {
  const hero = await db.hero.findUnique({ where: { id: heroId }, include: { abilities: { where: { active: true } } } });
  if (!hero) return { hero: "?", status: "error", note: "unknown hero" };
  try {
    const page = await fetchPage(`${hero.name}/Voice lines`);
    if (!page) return { hero: hero.name, status: "missing", note: `No page "${hero.name}/Voice lines"` };
    const heroes = await db.hero.findMany({ where: { active: true }, select: { id: true, name: true } });
    const rows = planVoiceEntries(page.content, hero, heroes);
    await db.$transaction([
      db.voiceEntry.deleteMany({ where: { heroId } }),
      db.voiceEntry.createMany({ data: rows, skipDuplicates: true }),
    ]);
    const n = (k: string) => rows.filter((r) => r.kind === k).length;
    return { hero: hero.name, status: "ok", select: n("select"), cast: n("cast"), convos: n("convo") };
  } catch (e) {
    return { hero: hero.name, status: "error", note: (e as Error).message };
  }
}

export async function importAllHeroVoice(): Promise<VoiceImport[]> {
  const heroes = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true } });
  const out: VoiceImport[] = [];
  for (const h of heroes) {
    out.push(await importHeroVoice(h.id));
    await sleep(600);
  }
  return out;
}
