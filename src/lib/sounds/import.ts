// The Resonance: sound index import (admin-triggered and in the daily sync), measurement, change check
// and approval. The automatic pass only suggests; nothing unreviewed is ever used in a puzzle.
import { db } from "../db";
import { fetchSoundIndex, type BackupMode } from "../deadlock/api";
import { soundMediaId, storeAsset } from "../media";
import { alert } from "../monitoring";
import { gainFor } from "./loudness";
import { measureMp3 } from "./decode";
import { clipsOf, codenameOf, resolveHeroFolders, type SoundTree } from "./resolve";
import { guessRole, isWeaponFire, matchClip, MIN_CLIP_MS, skipReason, type AbilityRef, type SoundRole } from "./match";
import type { Prisma } from "@/generated/prisma/client";

export type PlannedClip = {
  sourceUrl: string;
  sourcePath: string;
  heroId: number;
  abilityId: number | null;
  kind: "ability" | "weapon";
  role: SoundRole;
  score: number;
  status: "suggested" | "excluded";
  autoReason: string | null;
};

export type HeroForSounds = { id: number; className: string; name: string; abilities: AbilityRef[] };

/** Every codename-ish word tied to a hero (leak terms, and noise words for matching). */
export function heroCodenames(h: { className: string }, folders: { abilityFolders: string[]; weaponFolders: string[] }): string[] {
  return [...new Set([codenameOf(h.className), ...folders.abilityFolders, ...folders.weaponFolders])];
}

/** Pure: what the automatic pass wants for every clip in a hero's folders. */
export function planHeroClips(
  tree: SoundTree,
  hero: HeroForSounds,
  folders: { abilityFolders: string[]; weaponFolders: string[] },
): PlannedClip[] {
  const codenames = heroCodenames(hero, folders);
  const out: PlannedClip[] = [];
  const mp3 = (u: string) => /\.mp3$/i.test(u);
  for (const folder of folders.abilityFolders)
    for (const c of clipsOf(tree, "abilities", folder)) {
      if (!mp3(c.url)) continue;
      const m = matchClip(c.path, hero.abilities, codenames);
      const skip = skipReason(c.path);
      const reason = m.abilityId === null ? "unmatched" : skip;
      out.push({
        sourceUrl: c.url, sourcePath: c.path, heroId: hero.id, abilityId: m.abilityId, kind: "ability",
        role: guessRole(c.path), score: m.score, status: reason ? "excluded" : "suggested", autoReason: reason,
      });
    }
  for (const folder of folders.weaponFolders)
    for (const c of clipsOf(tree, "weapons", folder)) {
      if (!mp3(c.url)) continue;
      const fire = isWeaponFire(c.path);
      out.push({
        sourceUrl: c.url, sourcePath: c.path, heroId: hero.id, abilityId: null, kind: "weapon",
        role: "cast", score: fire ? 1 : 0, status: fire ? "suggested" : "excluded", autoReason: fire ? null : "not a fire sound",
      });
    }
  return out;
}

async function loadHeroes(): Promise<HeroForSounds[]> {
  const heroes = await db.hero.findMany({
    where: { active: true },
    include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } } },
    orderBy: { name: "asc" },
  });
  return heroes.map((h) => ({
    id: h.id, className: h.className, name: h.name,
    abilities: h.abilities.map((a) => ({ id: Number(a.id), className: a.className, name: a.name, slot: a.slot })),
  }));
}

export type SoundImportResult = {
  clips: number; added: number; updated: number; missing: number;
  unmappedHeroes: string[]; unclaimedFolders: string[];
};

/**
 * Fetch the index, refresh folder mappings (manual ones are kept) and upsert every clip in mapped
 * folders. Admin decisions (manual rows) are never overwritten; clips gone from the index are flagged.
 */
export async function importSounds(opts: { backup?: BackupMode } = {}): Promise<SoundImportResult> {
  const run = await db.syncRun.create({ data: { kind: "sounds", status: "running" } });
  try {
    const tree = (await fetchSoundIndex(opts.backup ?? "snapshot")) as SoundTree;
    const heroes = await loadHeroes();
    const resolved = resolveHeroFolders(heroes, tree);
    const maps = new Map((await db.heroSoundMap.findMany()).map((m) => [m.heroId, m]));

    const planned: PlannedClip[] = [];
    const unmappedHeroes: string[] = [];
    for (const h of heroes) {
      const r = resolved.heroes.find((x) => x.heroId === h.id)!;
      let map = maps.get(h.id);
      if (!map || map.source === "auto") {
        const data = { abilityFolders: r.abilities.map((f) => f.folder), weaponFolders: r.weapons.map((f) => f.folder), source: "auto" };
        map = await db.heroSoundMap.upsert({ where: { heroId: h.id }, create: { heroId: h.id, ...data }, update: data });
      }
      if (!map.abilityFolders.length) unmappedHeroes.push(h.name);
      planned.push(...planHeroClips(tree, h, map));
    }

    const existing = new Map((await db.soundClip.findMany()).map((c) => [c.sourceUrl, c]));
    const fresh: Prisma.SoundClipCreateManyInput[] = [];
    let updated = 0;
    for (const p of planned) {
      const prev = existing.get(p.sourceUrl);
      if (!prev) {
        fresh.push({ ...p, abilityId: p.abilityId === null ? null : BigInt(p.abilityId) });
        continue;
      }
      existing.delete(p.sourceUrl);
      // Admin decisions stick; measurement exclusions ("too short") stick until the clip changes.
      const keep = prev.manual || prev.status === "approved" || prev.autoReason === "too short";
      const next = keep
        ? { heroId: p.heroId, missing: false }
        : {
            heroId: p.heroId, abilityId: p.abilityId === null ? null : BigInt(p.abilityId), kind: p.kind, role: p.role,
            score: p.score, status: p.status, autoReason: p.autoReason, missing: false,
          };
      const same = Object.entries(next).every(([k, v]) => String((prev as Record<string, unknown>)[k]) === String(v));
      if (!same) {
        await db.soundClip.update({ where: { id: prev.id }, data: next });
        updated++;
      }
    }
    for (let i = 0; i < fresh.length; i += 1000) await db.soundClip.createMany({ data: fresh.slice(i, i + 1000), skipDuplicates: true });
    // Left over: no longer in any mapped folder (renamed upstream, or the mapping changed).
    const gone = [...existing.values()].filter((c) => !c.missing).map((c) => c.id);
    if (gone.length) await db.soundClip.updateMany({ where: { id: { in: gone } }, data: { missing: true } });

    const unclaimedFolders = [...resolved.unclaimed.abilities.map((f) => `abilities/${f}`), ...resolved.unclaimed.weapons.map((f) => `weapons/${f}`)];
    const result = { clips: planned.length, added: fresh.length, updated, missing: gone.length, unmappedHeroes, unclaimedFolders };
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "ok", finishedAt: new Date(),
        counts: { clips: result.clips, added: result.added, updated: result.updated, missing: result.missing },
        issues: [
          ...unmappedHeroes.map((n) => ({ entity: "hero", id: n, reason: "no ability sound folder" })),
          ...unclaimedFolders.map((f) => ({ entity: "sound-folder", id: f, reason: "no active hero (unreleased?)" })),
        ],
      },
    });
    return result;
  } catch (e) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: (e as Error).stack ?? String(e) } });
    await alert(`Sound index import failed: ${(e as Error).message}`);
    throw e;
  }
}

type Downloaded = { bytes: Uint8Array; etag: string | null };

async function download(url: string): Promise<Downloaded> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), etag: res.headers.get("etag") };
}

async function measured(d: Downloaded) {
  const m = await measureMp3(d.bytes);
  return { durationMs: m.durationMs, peakDb: m.peakDb, loudnessDb: m.loudnessDb, gainDb: gainFor(m), sourceHash: d.etag, measuredAt: new Date() };
}

/**
 * Measure suggested clips that haven't been measured yet, until `deadline` (ms timestamp). Resumable:
 * the next call picks up where this one stopped. Clips under 250 ms are excluded unless an admin kept them.
 */
export async function measurePending(deadline: number, opts: { heroId?: number; concurrency?: number } = {}): Promise<{ measured: number; failed: number; left: number }> {
  const where: Prisma.SoundClipWhereInput = { status: "suggested", measuredAt: null, missing: false, ...(opts.heroId ? { heroId: opts.heroId } : {}) };
  const todo = await db.soundClip.findMany({ where, orderBy: [{ kind: "asc" }, { heroId: "asc" }, { id: "asc" }], take: 2000 });
  let i = 0, ok = 0, failed = 0;
  await Promise.all(
    Array.from({ length: opts.concurrency ?? 6 }, async () => {
      while (i < todo.length && Date.now() < deadline) {
        const c = todo[i++];
        try {
          const m = await measured(await download(c.sourceUrl));
          const short = m.durationMs < MIN_CLIP_MS && !c.manual;
          await db.soundClip.update({ where: { id: c.id }, data: { ...m, ...(short ? { status: "excluded", autoReason: "too short" } : {}) } });
          ok++;
        } catch (e) {
          failed++;
          console.warn(`[sounds] measuring ${c.sourcePath} failed:`, (e as Error).message);
          await db.soundClip.update({ where: { id: c.id }, data: { measuredAt: new Date() } }); // don't retry forever
        }
      }
    }),
  );
  return { measured: ok, failed, left: (await db.soundClip.count({ where })) };
}

/**
 * Daily check of approved clips: a changed ETag sends the clip back to review (it stays mirrored, so
 * frozen puzzles keep working, but it isn't used for new ones until re-approved).
 */
export async function checkApprovedSources(deadline: number): Promise<{ checked: number; changed: number }> {
  const approved = await db.soundClip.findMany({ where: { status: "approved", missing: false }, select: { id: true, sourceUrl: true, sourceHash: true } });
  let i = 0, checked = 0, changed = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (i < approved.length && Date.now() < deadline) {
        const c = approved[i++];
        try {
          const res = await fetch(c.sourceUrl, { method: "HEAD", signal: AbortSignal.timeout(15000) });
          checked++;
          const etag = res.headers.get("etag");
          if (res.status === 404) await db.soundClip.update({ where: { id: c.id }, data: { missing: true } });
          else if (res.ok && etag && c.sourceHash && etag !== c.sourceHash) {
            await db.soundClip.update({ where: { id: c.id }, data: { status: "suggested", changed: true, sourceHash: etag, measuredAt: null } });
            changed++;
          }
        } catch { /* network hiccup: check again tomorrow */ }
      }
    }),
  );
  return { checked, changed };
}

/** Daily job step: import the index, check approved clips, measure what's pending. Never throws. */
export async function dailySoundSync(deadline: number) {
  try {
    const imported = await importSounds();
    const check = await checkApprovedSources(Math.min(deadline, Date.now() + 30_000));
    const measure = await measurePending(deadline);
    return { imported, check, measure };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Approve a clip: download, measure and mirror it (served as an opaque /media/<id> URL). */
export async function approveClip(id: number): Promise<void> {
  const c = await db.soundClip.findUniqueOrThrow({ where: { id } });
  const d = await download(c.sourceUrl);
  const m = await measured(d);
  // Keyed by URL + ETag: changed upstream bytes get a new asset, while frozen puzzles keep the old one.
  // An existing mirror of the same key (e.g. stored under an older salt) is reused so sourceUrl stays unique.
  const key = d.etag ? `${c.sourceUrl}#${d.etag.replace(/"/g, "")}` : c.sourceUrl;
  const prior = await db.mirroredAsset.findUnique({ where: { sourceUrl: key }, select: { id: true } });
  const assetId = prior?.id ?? (await storeAsset(soundMediaId(key), key, d.bytes, "audio/mpeg"));
  await db.soundClip.update({
    where: { id },
    data: { ...m, assetId, status: "approved", autoReason: null, manual: true, changed: false },
  });
}

export async function updateClip(id: number, patch: { status?: "suggested" | "excluded"; role?: SoundRole; abilityId?: number | null; preferred?: boolean }) {
  const c = await db.soundClip.findUniqueOrThrow({ where: { id } });
  if (patch.preferred) {
    // One star per ability (clip 1) or per hero's gun.
    await db.soundClip.updateMany({
      where: c.kind === "weapon" ? { heroId: c.heroId, kind: "weapon" } : { abilityId: c.abilityId, kind: "ability" },
      data: { preferred: false },
    });
  }
  await db.soundClip.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status, autoReason: null } : {}),
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.abilityId !== undefined ? { abilityId: patch.abilityId === null ? null : BigInt(patch.abilityId) } : {}),
      ...(patch.preferred !== undefined ? { preferred: patch.preferred } : {}),
      manual: true,
    },
  });
}
