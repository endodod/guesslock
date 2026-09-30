// Deadlock Wiki voice line import for The Echo (admin-triggered, never cron).
// Uses the MediaWiki API (action=query, revisions + imageinfo), not HTML scraping.
// Wiki text is CC BY-NC-SA 4.0: we keep page + revision id per line for attribution.
import { db } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { config } from "../config";
import { normalize, wordCount } from "../text/normalize";
import { redact } from "../text/redact";
import { heroTerms, sha } from "../text/entries";
import { CUSTOM_LINE_PREFIX } from "../admin/setup";

const MIN_WORDS = 6;
const GENERIC_PAGES = ["Generic Male/Voice lines", "Generic Female/Voice lines"];
const GENERIC_OVERLAP = 0.3; // share of a hero's lines found in a generic set

export class WikiBlockedError extends Error {}

async function wikiGet(params: Record<string, string>, attempt = 0): Promise<unknown> {
  const url = `${config.wikiApi}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: { "user-agent": config.wikiUserAgent, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    // Cloudflare challenge or error page: back off and retry a few times.
    if (attempt < 3) {
      await sleep(4000 * (attempt + 1));
      return wikiGet(params, attempt + 1);
    }
    throw new WikiBlockedError(`Wiki request blocked or failed (HTTP ${res.status}). Try again later.`);
  }
  return JSON.parse(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PageRev = { title: string; revid: number; content: string } | null;

async function fetchPage(title: string): Promise<PageRev> {
  const j = (await wikiGet({ action: "query", prop: "revisions", titles: title, rvprop: "ids|content", rvslots: "main", redirects: "1" })) as {
    query?: { pages?: { title: string; missing?: boolean; revisions?: { revid: number; slots: { main: { content: string } } }[] }[] };
  };
  const p = j.query?.pages?.[0];
  if (!p || p.missing || !p.revisions?.length) return null;
  return { title: p.title, revid: p.revisions[0].revid, content: p.revisions[0].slots.main.content };
}

export type ParsedLine = { fileName: string; text: string; section: string; prefix: string };

/** Strip wiki markup from a line: [[a|b]] -> b, ''italics'', templates, html. */
export function cleanWikiText(s: string): string {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function filePrefix(fileName: string): string {
  return fileName.toLowerCase().split(/[ _]/)[0];
}

export function parseVoiceLines(wikitext: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let section = "";
  for (const line of wikitext.split("\n")) {
    const h = line.match(/^=+\s*(.+?)\s*=+\s*$/);
    if (h) { section = cleanWikiText(h[1]); continue; }
    const re = /\{\{Audio link\|([^|}]+)\|([^}]*)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const text = cleanWikiText(m[2]);
      if (!text) continue;
      out.push({ fileName: m[1].trim(), text, section, prefix: filePrefix(m[1]) });
    }
  }
  return out;
}

/** The hero's own lines: files with the page's dominant filename prefix, deduped by text. */
export function ownLines(lines: ParsedLine[]): ParsedLine[] {
  const count = new Map<string, number>();
  for (const l of lines) count.set(l.prefix, (count.get(l.prefix) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const seen = new Set<string>();
  return lines.filter((l) => {
    if (l.prefix !== top) return false;
    const k = normalize(l.text);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function resolveAudioUrls(fileNames: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < fileNames.length; i += 50) {
    const batch = fileNames.slice(i, i + 50);
    const j = (await wikiGet({ action: "query", prop: "imageinfo", iiprop: "url", titles: batch.map((f) => `File:${f}`).join("|") })) as {
      query?: { normalized?: { from: string; to: string }[]; pages?: { title: string; imageinfo?: { url: string }[] }[] };
    };
    const back = new Map((j.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of j.query?.pages ?? []) {
      const url = p.imageinfo?.[0]?.url;
      if (!url) continue;
      const original = (back.get(p.title) ?? p.title).replace(/^File:/, "");
      out.set(original, url);
      out.set(p.title.replace(/^File:/, ""), url);
    }
    await sleep(800);
  }
  return out;
}

let genericCache: Set<string> | null = null;
async function genericSet(): Promise<Set<string>> {
  if (genericCache) return genericCache;
  const set = new Set<string>();
  for (const t of GENERIC_PAGES) {
    const p = await fetchPage(t);
    if (p) for (const l of parseVoiceLines(p.content)) set.add(normalize(l.text));
    await sleep(800);
  }
  genericCache = set;
  return set;
}

export type ImportResult = { heroId: number; hero: string; status: "ok" | "missing" | "error"; lines?: number; approved?: number; generic?: boolean; changed?: number; note?: string };

export async function importHeroVoiceLines(heroId: number): Promise<ImportResult> {
  const hero = await db.hero.findUnique({ where: { id: heroId }, include: { abilities: { where: { active: true } } } });
  if (!hero) return { heroId, hero: "?", status: "error", note: "unknown hero" };
  try {
    const page = await fetchPage(`${hero.name}/Voice lines`);
    if (!page) return { heroId, hero: hero.name, status: "missing", note: `No page "${hero.name}/Voice lines"` };
    const lines = ownLines(parseVoiceLines(page.content));
    const generic = await genericSet();
    const genericShare = lines.length ? lines.filter((l) => generic.has(normalize(l.text))).length / lines.length : 0;
    const isGeneric = genericShare >= GENERIC_OVERLAP || lines[0]?.prefix.startsWith("generic");
    // Text-only for now: audio clips are not imported yet (resolveAudioUrls is kept for later).
    const audio = new Map<string, string>();
    const terms = heroTerms(hero, hero.abilities.map((a) => a.name));

    const existing = new Map((await db.voiceLine.findMany({ where: { heroId } })).map((l) => [l.fileName, l]));
    let changed = 0;
    const seen = new Set<string>();
    const toCreate: Prisma.VoiceLineCreateManyInput[] = [];
    for (const l of lines) {
      seen.add(l.fileName);
      const sourceHash = sha(l.text);
      const { text: autoText, hits } = redact(l.text, terms);
      const words = wordCount(l.text);
      const auto =
        words < MIN_WORDS ? { status: "excluded", autoReason: `under ${MIN_WORDS} words` }
        : hits.length ? { status: "needs_redaction", autoReason: `mentions ${[...new Set(hits)].join(", ")}` }
        : { status: "approved", autoReason: null };
      const prev = existing.get(l.fileName);
      const base = { wikiPage: page.title, revisionId: page.revid, section: l.section, audioUrl: audio.get(l.fileName) ?? null, wordCount: words };
      if (!prev) {
        toCreate.push({ heroId, fileName: l.fileName, sourceText: l.text, sourceHash, autoText, ...base, ...auto });
      } else if (prev.sourceHash !== sourceHash) {
        changed++;
        // Never overwrite manual edits: flag them for review instead.
        await db.voiceLine.update({
          where: { id: prev.id },
          data: prev.manuallyEdited
            ? { ...base, sourceText: l.text, sourceHash, autoText, sourceChanged: true }
            : { ...base, sourceText: l.text, sourceHash, autoText, ...auto, sourceChanged: false },
        });
      } else if (!prev.manuallyEdited && (prev.autoText !== autoText || prev.status !== auto.status || prev.section !== base.section)) {
        // Unchanged source: only write when the automatic result changed (e.g. new aliases).
        await db.voiceLine.update({ where: { id: prev.id }, data: { ...base, autoText, ...auto } });
      }
    }
    // One round-trip for all new lines instead of one per line.
    if (toCreate.length) await db.voiceLine.createMany({ data: toCreate, skipDuplicates: true });
    for (const prev of existing.values())
      if (!seen.has(prev.fileName) && !prev.fileName.startsWith(CUSTOM_LINE_PREFIX) && prev.status !== "excluded")
        await db.voiceLine.update({ where: { id: prev.id }, data: { status: "excluded", autoReason: "removed from wiki", sourceChanged: true } });

    await db.hero.update({
      where: { id: heroId },
      data: { voiceImportedAt: new Date(), voiceRevisionId: page.revid, ...(hero.genericVoiceManual ? {} : { genericVoice: isGeneric }) },
    });
    const approved = await db.voiceLine.count({ where: { heroId, status: "approved" } });
    return { heroId, hero: hero.name, status: "ok", lines: lines.length, approved, generic: hero.genericVoiceManual ? hero.genericVoice : isGeneric, changed };
  } catch (e) {
    return { heroId, hero: hero.name, status: "error", note: (e as Error).message };
  }
}

const REFRESH_DAYS = 30;

/**
 * Automatic import for the daily job: heroes never imported first, then imports older than 30 days.
 * Stops when the time budget is used up; the next run continues where this one stopped.
 */
export async function importDueVoiceLines(budgetMs: number): Promise<ImportResult[]> {
  const started = Date.now();
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86400000);
  const due = await db.hero.findMany({
    where: { active: true, OR: [{ voiceImportedAt: null }, { voiceImportedAt: { lt: cutoff } }] },
    orderBy: [{ voiceImportedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  const results: ImportResult[] = [];
  for (const h of due) {
    if (Date.now() - started > budgetMs) break;
    const r = await importHeroVoiceLines(h.id);
    results.push(r);
    if (r.status === "error" && r.note?.includes("blocked")) break;
    await sleep(1000);
  }
  return results;
}

export async function importAllVoiceLines(onProgress?: (r: ImportResult) => void): Promise<ImportResult[]> {
  const run = await db.syncRun.create({ data: { kind: "voicelines", status: "running" } });
  const heroes = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const results: ImportResult[] = [];
  for (const h of heroes) {
    const r = await importHeroVoiceLines(h.id);
    results.push(r);
    onProgress?.(r);
    if (r.status === "error" && r.note?.includes("blocked")) break;
    await sleep(1500);
  }
  const failed = results.filter((r) => r.status === "error");
  await db.syncRun.update({
    where: { id: run.id },
    data: {
      status: failed.length ? "failed" : "ok", finishedAt: new Date(),
      counts: { heroes: results.length, ok: results.filter((r) => r.status === "ok").length },
      issues: results.filter((r) => r.status !== "ok"),
      error: failed.map((f) => `${f.hero}: ${f.note}`).join("\n") || null,
    },
  });
  return results;
}
