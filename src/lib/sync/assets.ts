// Sync job: fetch assets -> validate -> upsert -> flag changes -> refresh texts -> mirror images.
import { createHash } from "node:crypto";
import { db } from "../db";
import { config } from "../config";
import { fetchClientVersion, fetchHeroes, fetchItems, fetchMap } from "../deadlock/api";
import { normalizeAll, type SyncIssue } from "../deadlock/normalize";
import type { NormAbility, NormHero, NormItem } from "../deadlock/types";
import { mirrorAll } from "../media";
import { heroTerms, upsertTextEntry } from "../text/entries";
import { alert } from "../monitoring";
import { DEFAULT_EMOJIS } from "../data/emojis";
import { syncCategories } from "../seance/library";

/** The Cipher: the default 10-emoji set for heroes without a complete set (complete admin sets win). */
const emojiDefaults = (name: string, current: string[] = []) =>
  current.length < 10 && DEFAULT_EMOJIS[name] ? { emojis: DEFAULT_EMOJIS[name], emojisReviewed: true } : {};
import type { Prisma } from "@/generated/prisma/client";

type Diff = { added: string[]; removed: string[]; changed: { name: string; fields: string[] }[] };

const hash = (o: unknown) => createHash("sha1").update(JSON.stringify(o)).digest("hex");

function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
}

export async function runAssetSync(): Promise<{ id: number; status: string; diff?: Diff; error?: string }> {
  const run = await db.syncRun.create({ data: { kind: "assets", status: "running" } });
  try {
    // With data already in the DB, a failed sync just keeps it. Only a fresh database may be
    // filled from the stored/bundled API backup (any age), so a new install works during an outage.
    const fresh = (await db.hero.count()) === 0;
    const backup = fresh ? "snapshot-any-age" : "none";
    const [heroesRaw, itemsRaw, clientVersion] = await Promise.all([fetchHeroes(backup), fetchItems(backup), fetchClientVersion(backup)]);
    const norm = normalizeAll(heroesRaw, itemsRaw);
    const items = norm.items.filter((i) => !config.excludedItemTiers.includes(i.tier));
    if (norm.heroes.length < 10 || items.length < 50)
      throw new Error(`Suspiciously small payload (heroes=${norm.heroes.length}, items=${items.length}); aborting without changes.`);

    const diff: Diff = { added: [], removed: [], changed: [] };
    await syncHeroes(norm.heroes, diff);
    await syncAbilities(norm.abilities, diff);
    await syncItems(items, diff);
    await syncTexts();
    // The Séance: refresh API-derived categories. A failure here is logged, never fails the sync.
    const categories = await syncCategories(heroesRaw, itemsRaw).catch((e) => {
      norm.issues.push({ entity: "seance", id: "categories", reason: String((e as Error).message) });
      return null;
    });

    const imageUrls = [
      ...norm.heroes.flatMap((h) => [h.images.card, h.images.small, h.images.vertical]),
      ...norm.abilities.map((a) => a.image),
      ...items.flatMap((i) => [i.image, i.glyph]),
    ].filter((u): u is string => !!u);
    // The Omens' minimap (stored as the "assets-map" snapshot; a failure here must not fail the sync).
    const map = (await fetchMap().catch(() => null)) as { images?: { minimap?: string } } | null;
    if (map?.images?.minimap) imageUrls.push(map.images.minimap);
    const failedImages = await mirrorAll(imageUrls);

    const issues: SyncIssue[] = [...norm.issues, ...failedImages.map((u) => ({ entity: "image", id: u, reason: "mirror failed" }))];
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "ok", finishedAt: new Date(), clientVersion,
        counts: {
          heroes: norm.heroes.length, abilities: norm.abilities.length, items: items.length, images: imageUrls.length,
          ...(categories ? { categoriesCreated: categories.created, categoriesChanged: categories.changed.length } : {}),
        },
        diff: diff as unknown as Prisma.InputJsonValue,
        issues: issues as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: run.id, status: "ok", diff };
  } catch (e) {
    const error = (e as Error).stack ?? String(e);
    await db.syncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error } });
    await alert(`Asset sync #${run.id} failed: ${(e as Error).message}`);
    return { id: run.id, status: "failed", error };
  }
}

async function syncHeroes(heroes: NormHero[], diff: Diff) {
  const existing = new Map((await db.hero.findMany()).map((h) => [h.id, h]));
  const seen = new Set<number>();
  for (const h of heroes) {
    seen.add(h.id);
    const sourceHash = hash(h);
    const prev = existing.get(h.id);
    const source = h as unknown as Prisma.InputJsonValue;
    if (!prev) {
      // The first sync is the baseline; heroes that appear later are "new" and need curation
      // before they can be answers (they stay guessable in autocomplete).
      const isNew = existing.size > 0;
      diff.added.push(`hero:${h.name}`);
      await db.hero.create({
        data: { id: h.id, className: h.className, name: h.name, source, sourceHash, needsReview: isNew, reviewReasons: isNew ? ["new"] : [], ...emojiDefaults(h.name) },
      });
      continue;
    }
    const reasons = new Set(prev.reviewReasons);
    let needsReview = prev.needsReview;
    if (prev.sourceHash !== sourceHash) {
      const fields = changedFields(prev.source as Record<string, unknown>, h as unknown as Record<string, unknown>);
      diff.changed.push({ name: `hero:${h.name}`, fields });
      reasons.add(`changed: ${fields.join(", ")}`);
      needsReview = true;
    }
    if (!prev.active) {
      diff.added.push(`hero:${h.name} (returned)`);
      reasons.add("returned");
      needsReview = true;
    }
    await db.hero.update({
      where: { id: h.id },
      data: { className: h.className, name: h.name, source, sourceHash, active: true, removedAt: null, needsReview, reviewReasons: [...reasons], ...emojiDefaults(h.name, prev.emojis) },
    });
  }
  for (const prev of existing.values())
    if (!seen.has(Number(prev.id)) && prev.active) {
      diff.removed.push(`hero:${prev.name}`);
      await db.hero.update({
        where: { id: prev.id },
        data: { active: false, removedAt: new Date(), needsReview: true, reviewReasons: [...new Set([...prev.reviewReasons, "removed"])] },
      });
    }
}

async function syncAbilities(abilities: NormAbility[], diff: Diff) {
  const existing = new Map((await db.ability.findMany()).map((a) => [Number(a.id), a]));
  const seen = new Set<number>();
  for (const a of abilities) {
    seen.add(a.id);
    const sourceHash = hash(a);
    const prev = existing.get(a.id);
    const source = a as unknown as Prisma.InputJsonValue;
    const base = { className: a.className, name: a.name, heroId: a.heroId, slot: a.slot, source, sourceHash, active: true };
    if (!prev) {
      if (existing.size) diff.added.push(`ability:${a.name}`);
      await db.ability.create({ data: { id: a.id, ...base, needsReview: existing.size > 0, reviewReasons: existing.size ? ["new"] : [] } });
    } else if (prev.sourceHash !== sourceHash || !prev.active) {
      const fields = changedFields(prev.source as Record<string, unknown>, a as unknown as Record<string, unknown>);
      diff.changed.push({ name: `ability:${a.name}`, fields });
      await db.ability.update({
        where: { id: a.id },
        data: { ...base, needsReview: true, reviewReasons: [...new Set([...prev.reviewReasons, `changed: ${fields.join(", ")}`])] },
      });
    }
  }
  for (const prev of existing.values())
    if (!seen.has(Number(prev.id)) && prev.active) {
      diff.removed.push(`ability:${prev.name}`);
      await db.ability.update({ where: { id: prev.id }, data: { active: false } });
    }
}

async function syncItems(items: NormItem[], diff: Diff) {
  const existing = new Map((await db.item.findMany()).map((i) => [Number(i.id), i]));
  const seen = new Set<number>();
  for (const it of items) {
    seen.add(it.id);
    const sourceHash = hash(it);
    const prev = existing.get(it.id);
    const source = it as unknown as Prisma.InputJsonValue;
    const base = { className: it.className, name: it.name, source, sourceHash, active: true };
    if (!prev) {
      if (existing.size) diff.added.push(`item:${it.name}`);
      await db.item.create({ data: { id: it.id, ...base, needsReview: existing.size > 0, reviewReasons: existing.size ? ["new"] : [] } });
    } else if (prev.sourceHash !== sourceHash || !prev.active) {
      const fields = changedFields(prev.source as Record<string, unknown>, it as unknown as Record<string, unknown>);
      diff.changed.push({ name: `item:${it.name}`, fields });
      await db.item.update({
        where: { id: it.id },
        data: { ...base, needsReview: true, reviewReasons: [...new Set([...prev.reviewReasons, `changed: ${fields.join(", ")}`])] },
      });
    }
  }
  for (const prev of existing.values())
    if (!seen.has(Number(prev.id)) && prev.active) {
      diff.removed.push(`item:${prev.name}`);
      await db.item.update({ where: { id: prev.id }, data: { active: false } });
    }
}

/** Refresh redaction entries for lore, ability descriptions and upgrade tiers. */
export async function syncTexts() {
  const heroes = await db.hero.findMany({ where: { active: true }, include: { abilities: { where: { active: true } } } });
  for (const h of heroes) {
    const src = h.source as unknown as NormHero;
    const terms = heroTerms(h, h.abilities.map((a) => a.name));
    if (src.lore) await upsertTextEntry("hero_lore", h.id, src.lore, terms);
    for (const a of h.abilities) {
      const as = a.source as unknown as NormAbility;
      const aTerms = [...terms, ...a.aliases.map((term) => ({ term }))];
      if (as.description) await upsertTextEntry("ability_desc", Number(a.id), as.description, aTerms);
      const types = ["ability_t1", "ability_t2", "ability_t3"] as const;
      for (let i = 0; i < 3; i++) {
        const t = as.tiers[i];
        if (t) await upsertTextEntry(types[i], Number(a.id), t, aTerms);
      }
    }
  }
}
