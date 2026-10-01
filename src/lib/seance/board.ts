// Séance board generation (pure; unit-tested). Pick 4 categories and 4 heroes for each, then keep the
// board only if the grouping has exactly one solution and a fair number of red herrings.
import type { SeanceBoxId, SeanceEntity, SeanceTable } from "@/locks.config";
import type { Rng } from "../rng";
import { tableTypes, type LibraryCategory, type Rank, type SeanceGroup, type SeanceHero, type SeancePayload } from "./types";

export const BOARD = {
  groups: 4,
  size: 4,
  minHerrings: 2,
  maxHerrings: 5,
  /** Hero picks tried per category set, and in total, before the table is sealed for the day. */
  heroTries: 6,
  attempts: 600,
  /** No category repeats within this many days in the same table (capped by the pool size, see repeatWindow). */
  repeatDays: 14,
  /** Mixed tables: at least this many different category types among the 4 groups. */
  mixedTypes: 3,
};

/**
 * Number of ways to split `heroes` into the given categories so that every hero is assigned to a
 * category it's a member of and every category gets exactly `size` heroes. Stops at `limit`.
 */
export function countSolutions(heroes: number[], sets: ReadonlySet<number>[], size = BOARD.size, limit = Infinity): number {
  if (heroes.length !== sets.length * size) return 0;
  const options = heroes.map((h) => sets.flatMap((s, i) => (s.has(h) ? [i] : [])));
  if (options.some((o) => o.length === 0)) return 0;
  // Most constrained heroes first: prunes the search early.
  const order = heroes.map((_, i) => i).sort((a, b) => options[a].length - options[b].length);
  const left = sets.map(() => size);
  let count = 0;
  const walk = (k: number) => {
    if (k === order.length) { count++; return; }
    for (const g of options[order[k]]) {
      if (left[g] === 0) continue;
      left[g]--;
      walk(k + 1);
      left[g]++;
      if (count >= limit) return;
    }
  };
  walk(0);
  return count;
}

/** Per group: board heroes outside the group that are members of its category ("decoys"). */
export function decoys(groups: { members: number[]; set: ReadonlySet<number> }[]): number[] {
  const board = groups.flatMap((g) => g.members);
  return groups.map((g) => board.filter((h) => !g.members.includes(h) && g.set.has(h)).length);
}

/** Heroes on the board that are members of a chosen category they don't belong to in the solution. */
export function redHerrings(groups: { members: number[]; set: ReadonlySet<number> }[]): number {
  const board = groups.flatMap((g) => g.members);
  return board.filter((h) => groups.some((g) => !g.members.includes(h) && g.set.has(h))).length;
}

/**
 * Difficulty ranks (1 = easiest): the admin's difficulty plus a red-herring bonus (half a step per
 * decoy, at most 1.5). Ties break on category id, so the ranking is deterministic.
 */
export function rankGroups(groups: { categoryId: number; difficulty: number; decoys: number }[]): Rank[] {
  const score = (g: (typeof groups)[number]) => g.difficulty + Math.min(1.5, g.decoys * 0.5);
  const order = groups.map((g, i) => i).sort((a, b) => score(groups[a]) - score(groups[b]) || groups[a].categoryId - groups[b].categoryId);
  const ranks = new Array<Rank>(groups.length);
  order.forEach((gi, r) => { ranks[gi] = (r + 1) as Rank; });
  return ranks;
}

/** Days a category stays out of a table after use; small pools get a shorter window so a board stays possible. */
export function repeatWindow(poolSize: number, days = BOARD.repeatDays): number {
  return Math.max(0, Math.min(days, Math.floor(poolSize / BOARD.groups) - 1));
}

/** Categories a table may draw from: approved + complete (the caller's job), matching type, ≥ 4 members. */
export function tablePool(table: SeanceTable, categories: LibraryCategory[], entity: SeanceEntity = "hero"): LibraryCategory[] {
  const types = tableTypes(entity, table);
  return categories.filter((c) => types.includes(c.type) && c.members.length >= BOARD.size);
}

/** Whether a table can ever produce a board from this pool (cheap pre-check; the solver decides the rest). */
export function tableFeasible(table: SeanceTable, pool: LibraryCategory[]): string | null {
  if (pool.length < BOARD.groups) return `only ${pool.length} usable ${table === "mixed" ? "" : table + " "}categories (need ${BOARD.groups})`;
  if (table === "mixed" && new Set(pool.map((c) => c.type)).size < BOARD.mixedTypes)
    return `mixed needs categories of at least ${BOARD.mixedTypes} types`;
  return null;
}

/** Seeded pick of 4 categories: prefers one of each difficulty; Mixed takes 3+ different types first. */
export function pickCategories(table: SeanceTable, pool: LibraryCategory[], rng: Rng): LibraryCategory[] | null {
  const shuffled = rng.shuffle(pool);
  const picked: LibraryCategory[] = [];
  const types = () => new Set(picked.map((c) => c.type));
  const diffs = () => new Set(picked.map((c) => c.difficulty));
  const passes: ((c: LibraryCategory) => boolean)[] = [
    (c) => (table !== "mixed" || types().size >= BOARD.mixedTypes || !types().has(c.type)) && !diffs().has(c.difficulty),
    (c) => table !== "mixed" || types().size >= BOARD.mixedTypes || !types().has(c.type),
    () => true,
  ];
  for (const ok of passes)
    for (const c of shuffled) {
      if (picked.length === BOARD.groups) break;
      if (!picked.includes(c) && ok(c)) picked.push(c);
    }
  if (picked.length < BOARD.groups) return null;
  if (table === "mixed" && types().size < BOARD.mixedTypes) return null;
  return picked;
}

/**
 * Seeded pick of 4 distinct heroes per category (16 in total), smallest categories first. A hero who
 * also fits another chosen category is a red herring; the pick aims for a seeded target of 2–5 of
 * them (spread over the groups) and fills the rest with heroes that fit only their own group.
 */
export function pickHeroes(cats: LibraryCategory[], rng: Rng): number[][] | null {
  const used = new Set<number>();
  const out: number[][] = new Array(cats.length);
  const sets = cats.map((c) => new Set(c.members));
  const order = cats.map((_, i) => i).sort((a, b) => cats[a].members.length - cats[b].members.length || cats[a].id - cats[b].id);
  // Red-herring budget per group, e.g. 3 spread as [1, 0, 2, 0].
  const budget = cats.map(() => 0);
  const target = BOARD.minHerrings + rng.int(BOARD.maxHerrings - BOARD.minHerrings + 1);
  for (let k = 0; k < target; k++) budget[rng.int(cats.length)]++;
  for (const i of order) {
    const avail = [...cats[i].members].sort((a, b) => a - b).filter((h) => !used.has(h));
    if (avail.length < BOARD.size) return null;
    const fitsOther = (h: number) => sets.some((s, j) => j !== i && s.has(h));
    const decoys = rng.shuffle(avail.filter(fitsOther));
    const clean = rng.shuffle(avail.filter((h) => !fitsOther(h)));
    const n = Math.min(budget[i], decoys.length, BOARD.size);
    const pick = [...decoys.slice(0, n), ...clean.slice(0, BOARD.size - n)];
    // Not enough clean heroes: top up with more decoys.
    for (const h of decoys.slice(n)) if (pick.length < BOARD.size) pick.push(h);
    out[i] = pick;
    pick.forEach((h) => used.add(h));
  }
  return out;
}

export type BoardCheck = { solutions: number; redHerrings: number; decoys: number[] };

/** Checks a candidate board: solution count (capped at 2) and red herrings. */
export function checkBoard(cats: LibraryCategory[], members: number[][]): BoardCheck {
  const sets = cats.map((c) => new Set(c.members));
  const groups = members.map((m, i) => ({ members: m, set: sets[i] }));
  return { solutions: countSolutions(members.flat(), sets, BOARD.size, 2), redHerrings: redHerrings(groups), decoys: decoys(groups) };
}

export type BoardInput = {
  table: SeanceTable;
  entity?: SeanceEntity;
  /** Approved, complete categories (members limited to active heroes). */
  categories: LibraryCategory[];
  hero: (id: number) => SeanceHero | undefined;
  /** Category ids to avoid: used in this table within the repeat window, or elsewhere today. Soft: used only if nothing else works. */
  recent: ReadonlySet<number>;
  rng: Rng;
};

export type BoardResult = { ok: true; payload: SeancePayload; attempts: number } | { ok: false; reason: string };

/**
 * Builds a board: fresh categories first, then (for the last third of the attempts) the whole pool.
 * Deterministic for a given rng seed and input.
 */
export function generateBoard({ table, entity = "hero", categories, hero, recent, rng }: BoardInput): BoardResult {
  const pool = tablePool(table, categories, entity).sort((a, b) => a.id - b.id);
  const infeasible = tableFeasible(table, pool);
  if (infeasible) return { ok: false, reason: infeasible };
  const fresh = pool.filter((c) => !recent.has(c.id));
  // Why attempts failed, for the admin review queue when a table seals.
  const fails = { overlap: 0, ambiguous: 0, herrings: 0 };
  for (let attempt = 0; attempt < BOARD.attempts; ) {
    const from = attempt < (BOARD.attempts * 2) / 3 && !tableFeasible(table, fresh) ? fresh : pool;
    const cats = pickCategories(table, from, rng);
    if (!cats) { attempt += BOARD.heroTries; continue; }
    for (let h = 0; h < BOARD.heroTries; h++, attempt++) {
      const members = pickHeroes(cats, rng);
      if (!members) { fails.overlap++; continue; }
      const check = checkBoard(cats, members);
      if (check.solutions !== 1) { fails.ambiguous++; continue; }
      if (check.redHerrings < BOARD.minHerrings || check.redHerrings > BOARD.maxHerrings) { fails.herrings++; continue; }
      const ranks = rankGroups(cats.map((c, i) => ({ categoryId: c.id, difficulty: c.difficulty, decoys: check.decoys[i] })));
      const groups: SeanceGroup[] = cats
        .map((c, i) => ({ categoryId: c.id, label: c.label, explanation: c.explanation, difficulty: c.difficulty, rank: ranks[i], members: members[i] }))
        .sort((a, b) => a.rank - b.rank);
      const heroes = rng.shuffle(members.flat()).map((id) => hero(id) ?? { id, name: `#${id}`, image: null });
      return {
        ok: true,
        attempts: attempt + 1,
        payload: { v: 1, mode: "seance", entity, table, source: "daily", heroes, groups, redHerrings: check.redHerrings },
      };
    }
  }
  return {
    ok: false,
    reason: `no fair board in ${BOARD.attempts} attempts (${fails.ambiguous} ambiguous, ${fails.herrings} outside 2–5 red herrings, ${fails.overlap} too few distinct heroes)`,
  };
}

/** The frozen answer key of a board (DailyPuzzle.answerId): its category ids, sorted. */
export function boardKey(p: SeancePayload): string {
  return p.groups.map((g) => g.categoryId).sort((a, b) => a - b).join(",");
}

export function parseBoardKey(answerId: string): number[] {
  return answerId.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/** The Séance-family box a table slug belongs to ("seance-lore" -> "seance"), or null. */
export function boxOfSlug(slug: string): SeanceBoxId | null {
  const id = slug.split("-")[0];
  return id === "seance" || id === "bazaar" || id === "grimoire" ? id : null;
}
