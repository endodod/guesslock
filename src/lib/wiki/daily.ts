// Daily wiki check for The Echo family (VoiceEntry) and The Resonance's cast sounds.
// The pages change rarely (a new hero or a voice pass every couple of months), so one cheap request per 50 pages
// compares revision ids with the ones seen at the last import; only changed (or never imported) pages are fetched.
import { db } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { importHeroVoice } from "./herovoice";
import { importHeroCastSounds } from "./herosounds";
import { sleep, wikiGet } from "./voicelines";

const KEY = "wiki-revisions";
type Seen = { voice: Record<string, number>; sounds: Record<string, number> };

/** Latest revision id per page title (redirects resolved back to the requested title); missing pages are absent. */
export async function fetchRevisions(titles: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = (await wikiGet({ action: "query", prop: "revisions", rvprop: "ids", redirects: "1", titles: batch.join("|") })) as {
      query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: { title: string; missing?: boolean; revisions?: { revid: number }[] }[] };
    };
    // requested -> normalized -> redirected -> page title
    const step = new Map<string, string>();
    for (const n of j.query?.normalized ?? []) step.set(n.from, n.to);
    for (const r of j.query?.redirects ?? []) step.set(r.from, r.to);
    const resolve = (t: string) => { let x = t; for (let k = 0; k < 3 && step.has(x); k++) x = step.get(x)!; return x; };
    const byTitle = new Map((j.query?.pages ?? []).map((p) => [p.title, p.missing ? undefined : p.revisions?.[0]?.revid]));
    for (const t of batch) {
      const rev = byTitle.get(resolve(t));
      if (rev) out.set(t, rev);
    }
    if (i + 50 < titles.length) await sleep(800);
  }
  return out;
}

async function loadSeen(): Promise<Seen> {
  const row = await db.apiSnapshot.findUnique({ where: { key: KEY } });
  const d = (row?.data ?? {}) as Partial<Seen>;
  return { voice: d.voice ?? {}, sounds: d.sounds ?? {} };
}

async function saveSeen(seen: Seen) {
  const data = seen as unknown as Prisma.InputJsonValue;
  const json = JSON.stringify(seen);
  await db.apiSnapshot.upsert({
    where: { key: KEY },
    create: { key: KEY, url: "wiki:revisions", data, byteSize: json.length, fetchedAt: new Date() },
    update: { data, byteSize: json.length, fetchedAt: new Date() },
  });
}

export type WikiSyncResult = { checked: number; voice: string[]; sounds: string[]; failed: string[]; left: number };

/**
 * Re-import the voice and sound pages whose wiki revision changed since the last successful import.
 * Resumable: a page's revision is only recorded after its import worked, so the next run picks up the rest.
 */
export async function dailyWikiSync(deadline: number): Promise<WikiSyncResult> {
  const heroes = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const seen = await loadSeen();
  const voiceTitle = (h: { name: string }) => `${h.name}/Voice lines`;
  const soundTitle = (h: { name: string }) => `${h.name}/Sounds`;
  const revs = await fetchRevisions(heroes.flatMap((h) => [voiceTitle(h), soundTitle(h)]));
  const res: WikiSyncResult = { checked: revs.size, voice: [], sounds: [], failed: [], left: 0 };
  const have = new Set((await db.voiceEntry.groupBy({ by: ["heroId"] })).map((r) => r.heroId));

  for (const h of heroes) {
    const vr = revs.get(voiceTitle(h)), sr = revs.get(soundTitle(h));
    const voiceDue = vr !== undefined && (seen.voice[h.id] !== vr || !have.has(h.id));
    const soundsDue = sr !== undefined && seen.sounds[h.id] !== sr;
    if (Date.now() > deadline) { res.left += Number(voiceDue) + Number(soundsDue); continue; }
    if (voiceDue) {
      const r = await importHeroVoice(h.id);
      if (r.status === "ok") { seen.voice[h.id] = vr; res.voice.push(h.name); } else res.failed.push(`${h.name} voice: ${r.note}`);
      await sleep(600);
    }
    if (soundsDue) {
      const r = await importHeroCastSounds(h.id);
      if (r.status === "ok") { seen.sounds[h.id] = sr; res.sounds.push(h.name); } else res.failed.push(`${h.name} sounds: ${r.note}`);
      await sleep(600);
    }
  }
  await saveSeen(seen);
  return res;
}
