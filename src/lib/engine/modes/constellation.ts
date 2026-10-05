// The Constellation: a 3x3 grid. Each cell needs a hero that fits both its row's and its column's category.
// Categories come from the curated systems already in use: the attribute columns of The Reckoning (API values plus
// /admin/categories) and the approved Séance hero groups. The player types names (no suggestions); each hero fits one
// cell only. A wrong hero costs one of four lives; a placed hero can be taken off again for free, and the clue says when
// the heroes on the board make the grid impossible to finish.
import type { GameData, HeroData } from "../context";
import { activeColumns } from "../columns";
import { SealedError, SkipCandidate, type BasePayload, type ModeImpl } from "../mode";
import type { Rng } from "../../rng";

export type Facet = { dim: string; label: string; info: string; members: Set<number> };
type FacetView = { label: string; info: string };
type Hero = { id: number; name: string; image: string | null; keys: string[] };
type ConstellationClue = {
  rows: FacetView[]; cols: FacetView[];
  /** Valid hero ids per cell (row-major). */
  valid: number[][];
  /** One full solution (distinct heroes), shown for the empty cells once finished. */
  solution: number[];
  /** Every hero that can be typed (frozen with the puzzle): id, name, icon, normalized name and aliases. */
  heroes: Hero[];
};

/** A cell needs at least this many fitting heroes, so it's never a single forced answer. */
export const MIN_PER_CELL = 2;
const PER_CELL_SOULS = 10;
const FULL_GRID_BONUS = 10;

export const normalizeName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Category facets from the Reckoning columns: one per value of every exact/multi column (multi values split on ","). */
export function columnFacets(data: GameData, pool: HeroData[]): Facet[] {
  const out = new Map<string, Facet>();
  for (const col of activeColumns(data.heroColumns, pool, data)) {
    if (col.type !== "exact" && col.type !== "multi") continue;
    for (const h of pool) {
      const v = col.get(h, data);
      if (v === null || v === undefined || v === "") continue;
      const values = col.type === "multi" ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : [col.format ? col.format(v) : String(v)];
      for (const value of values) {
        const key = `${col.key}=${value.toLowerCase()}`;
        if (!out.has(key)) out.set(key, { dim: `col:${col.key}`, label: `${col.label}: ${value}`, info: col.info, members: new Set() });
        out.get(key)!.members.add(h.id);
      }
    }
  }
  return [...out.values()];
}

/** Facets with exactly the same heroes say the same thing twice ("Gender: Female", "Female heroes"): keep the first. */
export function dedupeFacets(facets: Facet[]): Facet[] {
  const seen = new Set<string>();
  return facets.filter((f) => {
    const k = [...f.members].sort((a, b) => a - b).join(",");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Two categories this close are the same idea from different sources ("Gender: Female" and the Séance group "Female
 * heroes", which can differ by a hero or two): nearly all of their heroes are shared. A grid never uses both: as row and
 * column the cell would just be one category again.
 */
export const RELATED_SIMILARITY = 0.7;

/** Shared heroes out of the heroes in either category (1: the same heroes). */
export function similarity(a: Facet, b: Facet): number {
  let both = 0;
  for (const h of a.members) if (b.members.has(h)) both++;
  const either = a.members.size + b.members.size - both;
  return either ? both / either : 0;
}

const related = (a: Facet, b: Facet) => similarity(a, b) >= RELATED_SIMILARITY;

/** Every hero of the smaller category is in the larger one ("Ultimate is channelled" inside "Has a channelled ability"). */
const within = (a: Facet, b: Facet) => {
  const [small, big] = a.members.size <= b.members.size ? [a, b] : [b, a];
  for (const h of small.members) if (!big.members.has(h)) return false;
  return true;
};

/** A row and column where one holds the other: that cell asks only for the smaller category. The first such pair, or null. */
export function redundantCell(rows: Facet[], cols: Facet[]): [Facet, Facet] | null {
  for (const r of rows) for (const c of cols) if (within(r, c)) return [r, c];
  return null;
}

/** Distinct heroes for all 9 cells, or null (simple backtracking over the smallest cells first). */
export function solveGrid(valid: number[][]): number[] | null {
  const order = valid.map((v, i) => ({ i, n: v.length })).sort((a, b) => a.n - b.n).map((x) => x.i);
  const pick: number[] = Array(valid.length).fill(-1);
  const used = new Set<number>();
  const go = (k: number): boolean => {
    if (k === order.length) return true;
    const cell = order[k];
    for (const h of valid[cell]) {
      if (used.has(h)) continue;
      used.add(h); pick[cell] = h;
      if (go(k + 1)) return true;
      used.delete(h);
    }
    return false;
  };
  return go(0) ? pick : null;
}

/**
 * Three row and three column facets, six different dimensions, no two related, no row inside a column (or the other way
 * round), every cell fair and the grid solvable.
 */
export function pickGrid(facets: Facet[], rng: Rng, tries = 4000): { rows: Facet[]; cols: Facet[]; valid: number[][]; solution: number[] } | null {
  if (facets.length < 6) return null;
  for (let t = 0; t < tries; t++) {
    const chosen: Facet[] = [];
    const dims = new Set<string>();
    for (const f of rng.shuffle(facets)) {
      if (dims.has(f.dim) || chosen.some((c) => related(c, f))) continue;
      chosen.push(f); dims.add(f.dim);
      if (chosen.length === 6) break;
    }
    if (chosen.length < 6) return null;
    const rows = chosen.slice(0, 3), cols = chosen.slice(3);
    if (redundantCell(rows, cols)) continue;
    const valid = gridCells(rows, cols);
    if (valid.some((v) => v.length < MIN_PER_CELL)) continue;
    const solution = solveGrid(valid);
    if (solution) return { rows, cols, valid, solution };
  }
  return null;
}

/** Guess: "<cell 0-8>:<typed name>" places a hero; "-<cell 0-8>" takes the hero off that cell. */
function parseGuess(g: string): { cell: number; text: string } | { remove: number } | null {
  const rm = /^-([0-8])$/.exec(g);
  if (rm) return { remove: Number(rm[1]) };
  const m = /^([0-8]):([\s\S]+)$/.exec(g);
  return m ? { cell: Number(m[1]), text: m[2] } : null;
}

/** The board after the guesses so far: placements in order, removals taking a hero off again. [cell, hero id] pairs. */
const filled = (rows: { id: string; correct: boolean }[]): [number, number][] => {
  const board = new Map<number, number>();
  for (const r of rows) {
    if (r.id.startsWith("-")) board.delete(Number(r.id.slice(1)));
    else if (r.correct) { const [cell, id] = r.id.split(":").map(Number); board.set(cell, id); }
  }
  return [...board];
};

/** Can every empty cell still get its own hero (one not on the board), whatever the player does next? Bipartite matching. */
export function canFinish(valid: number[][], board: [number, number][]): boolean {
  const used = new Set(board.map(([, id]) => id));
  const full = new Set(board.map(([cell]) => cell));
  const owner = new Map<number, number>(); // hero -> cell
  const place = (cell: number, seen: Set<number>): boolean => {
    for (const h of valid[cell]) {
      if (used.has(h) || seen.has(h)) continue;
      seen.add(h);
      const other = owner.get(h);
      if (other === undefined || place(other, seen)) { owner.set(h, cell); return true; }
    }
    return false;
  };
  for (let cell = 0; cell < valid.length; cell++) if (!full.has(cell) && !place(cell, new Set())) return false;
  return true;
}

/** The heroes a grid can use and every category it can draw from (Reckoning columns plus approved Séance hero groups). */
export function constellationFacets(data: GameData, groups: { key: string; label: string; info: string; members: number[] }[]): { pool: HeroData[]; facets: Facet[] } {
  const pool = data.heroes.filter((h) => h.eligible && !h.exclude.includes("constellation"));
  const ids = new Set(pool.map((h) => h.id));
  const fromGroups: Facet[] = groups.map((g) => ({
    dim: `group:${g.key}`, label: g.label, info: g.info, members: new Set(g.members.filter((id) => ids.has(id))),
  }));
  // Facets that almost everyone (or almost no one) fits make dull or impossible rows.
  const facets = dedupeFacets([...columnFacets(data, pool), ...fromGroups].filter((f) => f.members.size >= 3 && f.members.size <= pool.length - 3));
  return { pool, facets };
}

/** Cells of three rows and three columns: valid heroes per cell (row-major). */
export function gridCells(rows: Facet[], cols: Facet[]): number[][] {
  return rows.flatMap((r) => cols.map((c) => [...r.members].filter((h) => c.members.has(h)).sort((a, b) => a - b)));
}

/** Why a hand-picked grid isn't fair (see pickGrid), or its solution. */
export function checkGrid(rows: Facet[], cols: Facet[]): { valid: number[][]; solution: number[] } | { error: string } {
  if (rows.length !== 3 || cols.length !== 3) return { error: "Pick three rows and three columns." };
  if (new Set([...rows, ...cols].map((f) => f.dim)).size !== 6) return { error: "Each row and column needs a different kind of category." };
  const all = [...rows, ...cols];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (related(all[i], all[j])) return { error: `"${all[i].label}" and "${all[j].label}" are nearly the same category: use only one.` };
  }
  const valid = gridCells(rows, cols);
  const thin = valid.findIndex((v) => v.length < MIN_PER_CELL);
  if (thin >= 0) return { error: `Cell ${thin + 1} (${rows[Math.floor(thin / 3)].label} × ${cols[thin % 3].label}) fits fewer than ${MIN_PER_CELL} heroes.` };
  const inside = redundantCell(rows, cols);
  if (inside) return { error: `Every hero of one of "${inside[0].label}" and "${inside[1].label}" is in the other, so their cell asks only one thing.` };
  const solution = solveGrid(valid);
  return solution ? { valid, solution } : { error: "No way to fill all nine cells with different heroes." };
}

export function constellationPayload(grid: { rows: Facet[]; cols: Facet[]; valid: number[][]; solution: number[] }, pool: HeroData[], key: string): BasePayload<ConstellationClue> {
  return {
    v: 1, mode: "constellation", key,
    // The solution as a picture: the nine heroes of one full grid.
    answer: { id: "grid", name: "The full sky", image: null, images: grid.solution.flatMap((id) => { const u = pool.find((h) => h.id === id)?.icon; return u ? [u] : []; }) },
    correctIds: [],
    leakTerms: [],
    hints: {},
    clue: {
      rows: grid.rows.map(({ label, info }) => ({ label, info })),
      cols: grid.cols.map(({ label, info }) => ({ label, info })),
      valid: grid.valid, solution: grid.solution,
      heroes: pool.map((h) => ({ id: h.id, name: h.name, image: h.icon, keys: [...new Set([h.name, ...h.aliases].map(normalizeName).filter(Boolean))] })),
    },
  };
}

export const constellation: ModeImpl<ConstellationClue> = {
  mode: "constellation",
  selfPicked: true,
  candidates: () => [{ answerId: "grid", ref: 0 }],
  async build(_c, { data, rng, heroCategories, date }) {
    const { pool, facets } = constellationFacets(data, (await heroCategories?.()) ?? []);
    if (pool.length < 12) throw new SealedError("not enough heroes");
    const grid = pickGrid(facets, rng);
    if (!grid) throw new SkipCandidate("no fair grid from the current categories");
    return constellationPayload(grid, pool, `${date}:${[...grid.rows, ...grid.cols].map((f) => f.label).join("|")}`);
  },
  clue: (p, _wrong, done, _opts, rows = []) => {
    const hero = (id: number) => p.clue.heroes.find((h) => h.id === id);
    const cells: ({ id: string; name: string; image: string | null } | null)[] = Array(9).fill(null);
    for (const [cell, id] of filled(rows)) {
      const h = hero(id);
      if (h) cells[cell] = { id: String(h.id), name: h.name, image: h.image };
    }
    return {
      kind: "constellation", rows: p.clue.rows, cols: p.clue.cols, cells,
      stuck: !done && !canFinish(p.clue.valid, filled(rows)),
      ...(done ? { solution: p.clue.solution.map((id, i) => (cells[i] ? null : (({ name, image }) => ({ name, image }))(hero(id)!))) } : {}),
    };
  },
  judge(p, guess, rows) {
    const g = parseGuess(guess);
    if (!g) return { rejected: "Pick a cell first." };
    const done = filled(rows);
    if ("remove" in g) {
      const on = done.find(([cell]) => cell === g.remove);
      if (!on) return { rejected: "That cell is empty." };
      const h = p.clue.heroes.find((x) => x.id === on[1]);
      return { row: { id: `-${g.remove}`, name: `Took ${h?.name ?? "the hero"} off`, icon: h?.image ?? null, sub: `Cell ${g.remove + 1}`, correct: false }, wrong: false };
    }
    if (done.some(([cell]) => cell === g.cell)) return { rejected: "That cell is already filled." };
    const key = normalizeName(g.text);
    const h = /^\d+$/.test(g.text) ? p.clue.heroes.find((x) => String(x.id) === g.text) : p.clue.heroes.find((x) => x.keys.includes(key));
    if (!h) return { rejected: "No hero by that name." };
    if (done.some(([, id]) => id === h.id)) return { rejected: `${h.name} is already on the board.` };
    // A wrong try stays wrong; a hero taken off again may go back on.
    if (rows.some((r) => r.id === `${g.cell}:${h.id}` && !r.correct)) return { rejected: `${h.name} was already tried in that cell.` };
    const correct = p.clue.valid[g.cell].includes(h.id);
    return { row: { id: `${g.cell}:${h.id}`, name: h.name, icon: h.image, sub: `Cell ${g.cell + 1}`, correct }, wrong: !correct };
  },
  solved: (_p, rows) => filled(rows).length === 9,
  // Partial credit: every filled cell counts, a full grid earns a bonus. Never more than 100.
  souls: (_p, r) => {
    const n = filled(r.rows).length;
    return n * PER_CELL_SOULS + (n === 9 ? FULL_GRID_BONUS : 0);
  },
  displayed: (p) => [...p.clue.rows, ...p.clue.cols].map((f) => f.label),
};
