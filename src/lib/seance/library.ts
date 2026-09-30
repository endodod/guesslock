// Category library (DB): loading usable categories, the sync hook for API-derived categories,
// and building/freezing a table's board for a day.
import { db } from "../db";
import { config } from "../config";
import { SEANCE_LOCKS, type LockDef, type SeanceTable } from "@/locks.config";
import { makeRng, puzzleSeed } from "../rng";
import { addDays } from "../time";
import { mediaUrl } from "../media";
import type { NormHero } from "../deadlock/types";
import type { Prisma } from "@/generated/prisma/client";
import { deriveCategories, memberCount, type DerivedCategory } from "./derive";
import { reconcileMemberships, statusAfterSync, usableCategories } from "./rules";
import { boardKey, generateBoard, parseBoardKey, repeatWindow, tablePool, type BoardResult } from "./board";
import type { CategoryStatus, SeanceHero, SeancePayload } from "./types";

export async function activeHeroes(): Promise<SeanceHero[]> {
  const rows = await db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, source: true } });
  return rows.map((h) => {
    const src = h.source as unknown as NormHero;
    return { id: h.id, name: h.name, image: mediaUrl(src.images.card) ?? mediaUrl(src.images.small) };
  });
}

/** Categories with their memberships (a superset of CategoryRow). */
export async function loadCategoryRows(where: Prisma.CategoryWhereInput = {}) {
  return db.category.findMany({
    where,
    orderBy: [{ type: "asc" }, { label: "asc" }],
    include: { memberships: { select: { heroId: true, member: true, source: true } } },
  });
}

/** Approved, complete categories (what the generator may use) plus the active heroes. */
export async function loadLibrary() {
  const [heroes, rows] = await Promise.all([activeHeroes(), loadCategoryRows({ status: "approved" })]);
  return { heroes, categories: usableCategories(rows, heroes.map((h) => h.id)) };
}

/** Last day each category was used by any table (from the frozen boards' answer keys). */
export async function categoryUsage(): Promise<Map<number, { date: string; table: string }>> {
  const rows = await db.dailyPuzzle.findMany({
    where: { mode: { in: SEANCE_LOCKS.map((l) => l.slug) }, sealed: false },
    select: { date: true, mode: true, answerId: true },
    orderBy: { date: "asc" },
  });
  const out = new Map<number, { date: string; table: string }>();
  for (const r of rows) for (const id of parseBoardKey(r.answerId)) out.set(id, { date: r.date, table: r.mode.replace("seance-", "") });
  return out;
}

/** Unsealed Séance tables per day (the box's souls are their average), as a lookup. */
export async function tablesInPlay(range: { gte?: string; lte?: string } = {}): Promise<(date: string) => number> {
  const rows = await db.dailyPuzzle.groupBy({
    by: ["date"],
    where: { mode: { in: SEANCE_LOCKS.map((l) => l.slug) }, sealed: false, date: range },
    _count: { _all: true },
  });
  const by = new Map(rows.map((r) => [r.date, r._count._all]));
  return (date) => by.get(date) ?? 0;
}

// ───────────── sync hook ─────────────

export type CategorySyncResult = { created: number; changed: { label: string; added: number[]; removed: number[] }[] };

/**
 * Runs after every asset sync. New derivable categories (≥ 4 members) are created as drafts;
 * existing ones get their API memberships updated. A change flags the category for review and
 * stores the diff; an approved category drops back to draft only when it falls below 4 members.
 * Curated categories are untouched: a new hero simply has no row there ("unknown") until classified.
 */
export async function syncCategories(heroesRaw: unknown[], itemsRaw: unknown[]): Promise<CategorySyncResult> {
  const derived = deriveCategories(heroesRaw, itemsRaw);
  const existing = new Map((await db.category.findMany({ where: { key: { not: null } }, include: { memberships: true } })).map((c) => [c.key!, c]));
  const result: CategorySyncResult = { created: 0, changed: [] };
  for (const d of derived) {
    const prev = existing.get(d.key);
    if (!prev) {
      if (memberCount(d) < 4) continue;
      await createDerived(d);
      result.created++;
      continue;
    }
    const r = reconcileMemberships(prev.memberships, d.members);
    if (!r.upserts.length && !r.deletes.length) continue;
    await db.$transaction([
      ...r.upserts.map((u) =>
        db.categoryMembership.upsert({
          where: { categoryId_heroId: { categoryId: prev.id, heroId: u.heroId } },
          create: { categoryId: prev.id, heroId: u.heroId, member: u.member, source: d.source },
          update: { member: u.member, source: d.source },
        }),
      ),
      db.categoryMembership.deleteMany({ where: { categoryId: prev.id, heroId: { in: r.deletes }, source: { not: "admin" } } }),
    ]);
    if (r.added.length || r.removed.length) {
      const count = await db.categoryMembership.count({ where: { categoryId: prev.id, member: true } });
      const status = statusAfterSync(prev.status as CategoryStatus, count);
      await db.category.update({
        where: { id: prev.id },
        data: {
          flagged: true,
          flagReason: status !== prev.status ? `members changed in sync; fewer than 4 left, back to draft` : "members changed in sync",
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
  const rows = [...d.members].filter(([, v]) => v !== null).map(([heroId, member]) => ({ heroId, member: member!, source: d.source }));
  await db.category.create({
    data: {
      key: d.key, type: "mechanics", label: d.label, explanation: d.explanation, source: d.source,
      difficulty: d.difficulty, status: "draft", memberships: { create: rows },
    },
  });
}

// ───────────── boards ─────────────

/** Category ids to avoid for a table on `date`: its own recent boards, and today's other tables. */
async function recentCategories(slug: string, date: string, windowDays: number): Promise<Set<number>> {
  const slugs = SEANCE_LOCKS.map((l) => l.slug);
  const rows = await db.dailyPuzzle.findMany({
    where: {
      sealed: false,
      OR: [
        { mode: slug, date: { gte: addDays(date, -windowDays), lt: date } },
        { mode: { in: slugs.filter((s) => s !== slug) }, date },
      ],
    },
    select: { answerId: true },
  });
  return new Set(rows.flatMap((r) => parseBoardKey(r.answerId)));
}

/** Builds (without saving) the board for one table and day. `reroll` > 0 gives an alternative board (admin preview). */
export async function buildSeanceBoard(lock: LockDef, date: string, reroll = 0): Promise<BoardResult> {
  const table = lock.table!.kind as SeanceTable;
  const { heroes, categories } = await loadLibrary();
  const byId = new Map(heroes.map((h) => [h.id, h]));
  const pool = tablePool(table, categories);
  const recent = await recentCategories(lock.slug, date, repeatWindow(pool.length));
  const seed = puzzleSeed(date, lock.slug, config.salt) + (reroll ? `|reroll${reroll}` : "");
  return generateBoard({ table, categories, hero: (id) => byId.get(id), recent, rng: makeRng(`${seed}|board`) });
}

/** Freezes a board as the day's puzzle for a table (admin "use this board"). */
export async function saveSeanceBoard(date: string, slug: string, payload: SeancePayload, overridden: boolean) {
  const row = { answerId: boardKey(payload), payload: payload as unknown as Prisma.InputJsonValue, sealed: false, sealedReason: null, overridden };
  await db.dailyPuzzle.upsert({ where: { date_mode: { date, mode: slug } }, create: { date, mode: slug, ...row }, update: row });
}
