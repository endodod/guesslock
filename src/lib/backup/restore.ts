// Restores a curation backup (see curation.ts) into the database: the counterpart of snapshotCuration.
// Additive and idempotent: rows are upserted by their natural keys, nothing that is missing from the backup is deleted.
// Heroes must already exist (run a sync first); curation for unknown heroes is skipped and counted.
import { db } from "../db";
import type { Prisma } from "@/generated/prisma/client";

type Json = Prisma.InputJsonValue;
type Row = Record<string, unknown>;

export type CurationBackup = {
  takenAt?: string;
  heroes?: Row[]; categories?: Row[]; voiceEntries?: Row[]; soundClips?: Row[]; soundMaps?: Row[]; texts?: Row[];
  seance?: (Row & { memberships?: Row[] })[];
};

export type RestoreCounts = Record<string, { restored: number; skipped: number }>;

const s = (v: unknown) => (typeof v === "string" ? v : null);
const big = (v: unknown) => (v === null || v === undefined ? null : BigInt(String(v)));
const date = (v: unknown) => (v ? new Date(String(v)) : null);
const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Json));

export async function restoreCuration(b: CurationBackup): Promise<RestoreCounts> {
  const counts: RestoreCounts = {};
  const tally = (k: string, ok: boolean) => {
    counts[k] ??= { restored: 0, skipped: 0 };
    counts[k][ok ? "restored" : "skipped"]++;
  };
  const heroIds = new Set((await db.hero.findMany({ select: { id: true } })).map((h) => h.id));

  for (const h of b.heroes ?? []) {
    const id = Number(h.id);
    if (!heroIds.has(id)) { tally("heroes", false); continue; }
    await db.hero.update({
      where: { id },
      data: {
        aliases: (h.aliases as string[]) ?? [], excludeFromModes: (h.excludeFromModes as string[]) ?? [],
        genderOverride: s(h.genderOverride), species: s(h.species), weaponTypeOverride: s(h.weaponTypeOverride),
        releaseDate: date(h.releaseDate), emojis: (h.emojis as string[]) ?? [], emojisReviewed: !!h.emojisReviewed,
        genericVoice: !!h.genericVoice, genericVoiceManual: !!h.genericVoiceManual,
        attrs: json(h.attrs), setup: json(h.setup),
      },
    });
    tally("heroes", true);
  }

  for (const c of b.categories ?? []) {
    const data = {
      entity: String(c.entity), label: String(c.label), info: String(c.info ?? ""), type: String(c.type), unit: String(c.unit ?? ""),
      builtin: !!c.builtin, enabled: c.enabled !== false, order: Number(c.order ?? 0),
    };
    await db.category.upsert({ where: { key: String(c.key) }, create: { key: String(c.key), ...data }, update: data });
    tally("categories", true);
  }

  for (const e of b.voiceEntries ?? []) {
    const heroId = Number(e.heroId);
    if (!heroIds.has(heroId)) { tally("voiceEntries", false); continue; }
    const key = { heroId, kind: String(e.kind), fileKey: String(e.fileKey) };
    const data = {
      abilityId: big(e.abilityId), abilitySlot: e.abilitySlot === null || e.abilitySlot === undefined ? null : Number(e.abilitySlot),
      otherHeroId: e.otherHeroId === null || e.otherHeroId === undefined ? null : Number(e.otherHeroId),
      text: s(e.text), lines: json(e.lines), status: String(e.status ?? "approved"),
    };
    await db.voiceEntry.upsert({ where: { heroId_kind_fileKey: key }, create: { ...key, ...data }, update: data });
    tally("voiceEntries", true);
  }

  for (const m of b.soundMaps ?? []) {
    const heroId = Number(m.heroId);
    if (!heroIds.has(heroId)) { tally("soundMaps", false); continue; }
    const data = { abilityFolders: (m.abilityFolders as string[]) ?? [], weaponFolders: (m.weaponFolders as string[]) ?? [], source: String(m.source ?? "manual") };
    await db.heroSoundMap.upsert({ where: { heroId }, create: { heroId, ...data }, update: data });
    tally("soundMaps", true);
  }

  // Clip metadata only: the audio itself lives in MirroredAsset. A clip whose mirror is missing is restored without
  // its asset, so it is not used until it is re-approved (which mirrors it again).
  const assetIds = new Set((await db.mirroredAsset.findMany({ select: { id: true } })).map((a) => a.id));
  for (const c of b.soundClips ?? []) {
    const assetId = s(c.assetId);
    const data = {
      sourcePath: String(c.sourcePath), heroId: c.heroId === null ? null : Number(c.heroId), abilityId: big(c.abilityId),
      kind: String(c.kind), role: String(c.role), score: Number(c.score ?? 0), status: assetId && assetIds.has(assetId) ? String(c.status) : "suggested",
      autoReason: s(c.autoReason), preferred: !!c.preferred, manual: !!c.manual, durationMs: c.durationMs === null ? null : Number(c.durationMs),
      peakDb: c.peakDb === null ? null : Number(c.peakDb), loudnessDb: c.loudnessDb === null ? null : Number(c.loudnessDb),
      gainDb: c.gainDb === null ? null : Number(c.gainDb), assetId: assetId && assetIds.has(assetId) ? assetId : null, sourceHash: s(c.sourceHash),
    };
    await db.soundClip.upsert({ where: { sourceUrl: String(c.sourceUrl) }, create: { sourceUrl: String(c.sourceUrl), ...data }, update: data });
    tally("soundClips", !!data.assetId);
  }

  for (const t of b.texts ?? []) {
    const key = { entityType: String(t.entityType), entityId: BigInt(String(t.entityId)) };
    const existing = await db.textEntry.findUnique({ where: { entityType_entityId: key } });
    if (!existing) { tally("texts", false); continue; } // the sync creates text rows; restore only the edit
    // An edit made for a different source text is restored as stale, like any rewrite whose source changed.
    await db.textEntry.update({
      where: { entityType_entityId: key },
      data: { finalText: s(t.finalText), status: String(t.status), stale: existing.sourceHash !== t.sourceHash || !!t.stale },
    });
    tally("texts", true);
  }

  for (const g of b.seance ?? []) {
    const data = {
      entity: String(g.entity ?? "hero"), type: String(g.type), label: String(g.label), explanation: s(g.explanation),
      source: String(g.source), difficulty: Number(g.difficulty ?? 2), status: String(g.status ?? "draft"),
      flagged: !!g.flagged, flagReason: s(g.flagReason),
    };
    const key = s(g.key);
    // Keyed groups (API-derived) match by key; hand-written ones by entity + label.
    const existing = key
      ? await db.seanceCategory.findUnique({ where: { key } })
      : await db.seanceCategory.findFirst({ where: { key: null, entity: data.entity, label: data.label } });
    const cat = existing
      ? await db.seanceCategory.update({ where: { id: existing.id }, data })
      : await db.seanceCategory.create({ data: { ...data, key } });
    const rows = (g.memberships ?? []).map((m) => ({ categoryId: cat.id, entityId: BigInt(String(m.entityId)), member: !!m.member, source: String(m.source) }));
    await db.$transaction([
      db.seanceMembership.deleteMany({ where: { categoryId: cat.id } }),
      db.seanceMembership.createMany({ data: rows }),
    ]);
    tally("seance", true);
  }
  return counts;
}
