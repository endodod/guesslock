// Category library (DB): loading usable categories, the sync hook for derived and curated categories,
// and building/freezing a table's board for a day. One library per entity: heroes (The Séance), items (The Bazaar)
// and abilities (The Grimoire); a category belongs to exactly one entity.
import { db } from "../db";
import { config } from "../config";
import { SEANCE_BOXES, SEANCE_LOCKS, type LockDef, type SeanceEntity, type SeanceTable } from "@/locks.config";
import { makeRng, puzzleSeed } from "../rng";
import { addDays } from "../time";
import { mediaUrl } from "../media";
import type { NormAbility, NormHero, NormItem } from "../deadlock/types";
import type { Prisma } from "@/generated/prisma/client";
import { deriveAll, memberCount, type DerivedCategory } from "./derive";
import { reconcileMemberships, statusAfterSync, usableCategories } from "./rules";
import { boxOfSlug, boardKey, generateBoard, parseBoardKey, repeatWindow, tablePool, type BoardResult } from "./board";
import type { CategoryStatus, SeanceHero, SeancePayload } from "./types";

/** Every active entity of a kind as a board tile, by name. */
export async function activeEntities(entity: SeanceEntity): Promise<SeanceHero[]> {
  if (entity === "hero") {
    const rows = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, source: true } });
    return rows.map((h) => {
      const src = h.source as unknown as NormHero;
      return { id: h.id, name: h.name, image: mediaUrl(src.images.card) ?? mediaUrl(src.images.small) };
    });
  }
  if (entity === "item") {
    const rows = await db.item.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, source: true } });
    return rows.map((i) => ({ id: Number(i.id), name: i.name, image: mediaUrl((i.source as unknown as NormItem).image) }));
  }
  const [rows, heroes] = await Promise.all([
    db.ability.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, heroId: true, source: true } }),
    db.hero.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const heroName = new Map(heroes.map((h) => [h.id, h.name]));
  return rows
    .filter((a) => heroName.has(a.heroId))
    .map((a) => ({ id: Number(a.id), name: a.name, image: mediaUrl((a.source as unknown as NormAbility).image), sub: heroName.get(a.heroId) }));
}

/** Categories with their memberships (a superset of CategoryRow); entity ids come back as plain numbers. */
export async function loadCategoryRows(where: Prisma.SeanceCategoryWhereInput = {}) {
  const rows = await db.seanceCategory.findMany({
    where,
    orderBy: [{ entity: "asc" }, { type: "asc" }, { label: "asc" }],
    include: { memberships: { select: { entityId: true, member: true, source: true } } },
  });
  return rows.map((c) => ({ ...c, memberships: c.memberships.map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source })) }));
}

/** Approved, complete categories of one entity (what the generator may use) plus that entity's tiles. */
export async function loadLibrary(entity: SeanceEntity = "hero") {
  const [entities, rows] = await Promise.all([activeEntities(entity), loadCategoryRows({ status: "approved", entity })]);
  return { entities, categories: usableCategories(rows, entities.map((h) => h.id)) };
}

/** Last day each category was used by any table (from the frozen boards' answer keys). */
export async function categoryUsage(): Promise<Map<number, { date: string; table: string }>> {
  const rows = await db.dailyPuzzle.findMany({
    where: { mode: { in: SEANCE_LOCKS.map((l) => l.slug) }, sealed: false },
    select: { date: true, mode: true, answerId: true },
    orderBy: { date: "asc" },
  });
  const out = new Map<number, { date: string; table: string }>();
  for (const r of rows) for (const id of parseBoardKey(r.answerId)) out.set(id, { date: r.date, table: r.mode });
  return out;
}

/** Unsealed tables per day and box (a box's souls are the average of its tables), as a lookup. */
export async function tablesInPlay(range: { gte?: string; lte?: string } = {}): Promise<(date: string, box?: string) => number> {
  const rows = await db.dailyPuzzle.findMany({
    where: { mode: { in: SEANCE_LOCKS.map((l) => l.slug) }, sealed: false, date: range },
    select: { date: true, mode: true },
  });
  const by = new Map<string, number>();
  for (const r of rows) {
    const box = boxOfSlug(r.mode);
    if (box) by.set(`${box}|${r.date}`, (by.get(`${box}|${r.date}`) ?? 0) + 1);
  }
  return (date, box = "seance") => by.get(`${box}|${date}`) ?? 0;
}

// ───────────── sync hook ─────────────

export type CategorySyncResult = { created: number; changed: { label: string; added: number[]; removed: number[] }[] };

/**
 * Runs after every asset sync. New derivable categories (at least 4 members) are created (vetted ones approved, the
 * rest as drafts); existing ones get their derived memberships updated. A change flags the category for review and
 * stores the diff; an approved category drops back to draft only when it falls below 4 members.
 * Admin-set memberships are never overwritten: a new entity simply has no row ("unknown") until it is classified.
 */
export async function syncCategories(heroesRaw: unknown[], itemsRaw: unknown[]): Promise<CategorySyncResult> {
  const derived = deriveAll(heroesRaw, itemsRaw);
  const existing = new Map((await db.seanceCategory.findMany({ where: { key: { not: null } }, include: { memberships: true } })).map((c) => [c.key!, c]));
  const result: CategorySyncResult = { created: 0, changed: [] };
  for (const d of derived) {
    const prev = existing.get(d.key);
    if (!prev) {
      if (memberCount(d) < 4) continue;
      await createDerived(d);
      result.created++;
      continue;
    }
    const rows = prev.memberships.map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source }));
    const r = reconcileMemberships(rows, d.members);
    if (!r.upserts.length && !r.deletes.length) continue;
    await db.$transaction([
      ...r.upserts.map((u) =>
        db.seanceMembership.upsert({
          where: { categoryId_entityId: { categoryId: prev.id, entityId: BigInt(u.entityId) } },
          create: { categoryId: prev.id, entityId: BigInt(u.entityId), member: u.member, source: d.source },
          update: { member: u.member, source: d.source },
        }),
      ),
      db.seanceMembership.deleteMany({ where: { categoryId: prev.id, entityId: { in: r.deletes.map(BigInt) }, source: { notIn: ["admin", "agent"] } } }),
    ]);
    if (r.added.length || r.removed.length) {
      const count = await db.seanceMembership.count({ where: { categoryId: prev.id, member: true } });
      const status = statusAfterSync(prev.status as CategoryStatus, count);
      await db.seanceCategory.update({
        where: { id: prev.id },
        data: {
          flagged: true,
          flagReason: status !== prev.status ? "members changed in sync; fewer than 4 left, back to draft" : "members changed in sync",
          diff: { added: r.added, removed: r.removed, at: new Date().toISOString() },
          status,
        },
      });
      result.changed.push({ label: prev.label, added: r.added, removed: r.removed });
    }
  }
  return result;
}

async function createDerived(d: DerivedCategory) {
  const rows = [...d.members].filter(([, v]) => v !== null).map(([id, member]) => ({ entityId: BigInt(id), member: member!, source: d.source }));
  await db.seanceCategory.create({
    data: {
      key: d.key, entity: d.entity, type: d.type, label: d.label, explanation: d.explanation, source: d.source,
      difficulty: d.difficulty, status: d.vetted ? "approved" : "draft", memberships: { create: rows },
    },
  });
}

// ───────────── boards ─────────────

/** Category ids to avoid for a table on `date`: its own recent boards, and today's other tables of the same box. */
async function recentCategories(slug: string, date: string, windowDays: number): Promise<Set<number>> {
  const box = boxOfSlug(slug);
  const sameBox = SEANCE_LOCKS.filter((l) => l.box === box).map((l) => l.slug);
  const rows = await db.dailyPuzzle.findMany({
    where: {
      sealed: false,
      OR: [
        { mode: slug, date: { gte: addDays(date, -windowDays), lt: date } },
        { mode: { in: sameBox.filter((s) => s !== slug) }, date },
      ],
    },
    select: { answerId: true },
  });
  return new Set(rows.flatMap((r) => parseBoardKey(r.answerId)));
}

/** Builds (without saving) the board for one table and day. `reroll` > 0 gives an alternative board (admin preview). */
export async function buildSeanceBoard(lock: LockDef, date: string, reroll = 0): Promise<BoardResult> {
  const table = lock.table!.kind as SeanceTable;
  const entity = SEANCE_BOXES[lock.box!].entity;
  const { entities, categories } = await loadLibrary(entity);
  const byId = new Map(entities.map((h) => [h.id, { id: h.id, name: h.name, image: h.image }]));
  const pool = tablePool(table, categories, entity);
  const recent = await recentCategories(lock.slug, date, repeatWindow(pool.length));
  const seed = puzzleSeed(date, lock.slug, config.salt) + (reroll ? `|reroll${reroll}` : "");
  return generateBoard({ table, entity, categories, hero: (id) => byId.get(id), recent, rng: makeRng(`${seed}|board`) });
}

/** Freezes a board as the day's puzzle for a table (admin "use this board"). */
export async function saveSeanceBoard(date: string, slug: string, payload: SeancePayload, overridden: boolean) {
  const row = { answerId: boardKey(payload), payload: payload as unknown as Prisma.InputJsonValue, sealed: false, sealedReason: null, overridden };
  await db.dailyPuzzle.upsert({ where: { date_mode: { date, mode: slug } }, create: { date, mode: slug, ...row }, update: row });
}
