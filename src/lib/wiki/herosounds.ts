// The Resonance: ability cast sounds from a hero's wiki "Sounds" page (https://deadlock.wiki/<Hero>/Sounds).
// Each ability section lists its audio files; only the "Cast" ones are used. They are downloaded, measured
// and mirrored under salted ids (never the wiki file name), then stored as approved SoundClip rows.
import { db } from "../db";
import { soundMediaId, storeAsset } from "../media";
import { measureMp3 } from "../sounds/decode";
import { gainFor } from "../sounds/loudness";
import { MIN_CLIP_MS } from "../sounds/match";
import { normalize } from "../text/normalize";
import { fetchPage, resolveAudioUrls, sleep } from "./voicelines";
import { sectionOf } from "./herovoice";

export type CastSound = { ability: string; label: string; file: string };

/** Cast clips per ability: rows whose label is "Cast" / "Cast 01", in page order. */
export function parseCastSounds(wikitext: string): CastSound[] {
  const out: CastSound[] = [];
  const parts = sectionOf(wikitext, "Abilities").split(/^===\s*\{\{AbilityIcon\|([^}|]+)[^}]*\}\}\s*===\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const ability = parts[i].trim();
    const lines = (parts[i + 1] ?? "").split("\n");
    for (let j = 0; j < lines.length - 1; j++) {
      const label = /^\|\s*(Cast(?: \d+)?)\s*$/i.exec(lines[j]);
      const file = /^\|\s*\[\[File:([^\]|]+\.mp3)/i.exec(lines[j + 1] ?? "");
      if (label && file) out.push({ ability, label: label[1], file: file[1].trim() });
    }
  }
  return out;
}

export type SoundImport = { hero: string; status: "ok" | "missing" | "error"; abilities?: number; clips?: number; note?: string };

export async function importHeroCastSounds(heroId: number): Promise<SoundImport> {
  const hero = await db.hero.findUnique({ where: { id: heroId }, include: { abilities: { where: { active: true } } } });
  if (!hero) return { hero: "?", status: "error", note: "unknown hero" };
  try {
    const page = await fetchPage(`${hero.name}/Sounds`);
    if (!page) return { hero: hero.name, status: "missing", note: `No page "${hero.name}/Sounds"` };
    const byName = new Map(hero.abilities.flatMap((a) => [a.name, ...a.aliases].map((n) => [normalize(n), a] as const)));
    const wanted = parseCastSounds(page.content).flatMap((c) => {
      const a = byName.get(normalize(c.ability));
      return a ? [{ ...c, a }] : [];
    });
    if (!wanted.length) return { hero: hero.name, status: "ok", abilities: 0, clips: 0, note: "no cast sounds on the page" };
    const urls = await resolveAudioUrls(wanted.map((w) => w.file));
    const abilities = new Set<string>();
    let clips = 0;
    for (const w of wanted) {
      const url = urls.get(w.file);
      if (!url) continue;
      const existing = await db.soundClip.findUnique({ where: { sourceUrl: url } });
      if (existing?.status === "approved" && existing.assetId) { abilities.add(String(w.a.id)); clips++; continue; }
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const m = await measureMp3(bytes);
      if (m.durationMs < MIN_CLIP_MS) continue;
      const assetId = await storeAsset(soundMediaId(url), url, bytes, "audio/mpeg");
      const data = {
        sourcePath: `wiki/${hero.name}/${w.ability}/${w.label}`, heroId, abilityId: w.a.id, kind: "ability", role: "cast",
        status: "approved", manual: true, assetId, durationMs: m.durationMs, peakDb: m.peakDb, loudnessDb: m.loudnessDb,
        gainDb: gainFor(m), measuredAt: new Date(), autoReason: null, missing: false,
      };
      await db.soundClip.upsert({ where: { sourceUrl: url }, create: { sourceUrl: url, ...data }, update: data });
      abilities.add(String(w.a.id));
      clips++;
    }
    return { hero: hero.name, status: "ok", abilities: abilities.size, clips };
  } catch (e) {
    return { hero: hero.name, status: "error", note: (e as Error).message };
  }
}

export async function importAllCastSounds(): Promise<SoundImport[]> {
  const heroes = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true } });
  const out: SoundImport[] = [];
  for (const h of heroes) {
    out.push(await importHeroCastSounds(h.id));
    await sleep(600);
  }
  return out;
}
