// The Constellation: a 3x3 grid. Each cell needs a hero that fits both its row's and its column's category.
// Categories come from the curated systems already in use: the attribute columns of The Reckoning (API values plus
// /admin/categories) and the approved Séance hero groups. The player types names (no suggestions); each hero fits one
// cell only. A wrong hero costs one of four lives; a filled cell is final.
import type { GameData, HeroData } from "../context";
import { activeColumns } from "../columns";
import { SealedError, SkipCandidate, type ModeImpl } from "../mode";
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

/** Three row and three column facets, six different dimensions, every cell fair and the grid solvable. */
export function pickGrid(facets: Facet[], rng: Rng, tries = 4000): { rows: Facet[]; cols: Facet[]; valid: number[][]; solution: number[] } | null {
  if (facets.length < 6) return null;
  for (let t = 0; t < tries; t++) {
    const chosen: Facet[] = [];
    const dims = new Set<string>();
    for (const f of rng.shuffle(facets)) {
      if (dims.has(f.dim)) continue;
      chosen.push(f); dims.add(f.dim);
      if (chosen.length === 6) break;
    }
    if (chosen.length < 6) return null;
    const rows = chosen.slice(0, 3), cols = chosen.slice(3);
    const valid = rows.flatMap((r) => cols.map((c) => [...r.members].filter((h) => c.members.has(h)).sort((a, b) => a - b)));
    if (valid.some((v) => v.length < MIN_PER_CELL)) continue;
    const solution = solveGrid(valid);
    if (solution) return { rows, cols, valid, solution };
  }
  return null;
}

/** Guess: "<cell 0-8>:<typed name>". */
function parseGuess(g: string): { cell: number; text: string } | null {
  const m = /^([0-8]):([\s\S]+)$/.exec(g);
  return m ? { cell: Number(m[1]), text: m[2] } : null;
}

const filled = (rows: { id: string; correct: boolean }[]) => rows.filter((r) => r.correct).map((r) => r.id.split(":").map(Number) as [number, number]);

export const constellation: ModeImpl<ConstellationClue> = {
  mode: "constellation",
  selfPicked: true,
  candidates: () => [{ answerId: "grid", ref: 0 }],
  async build(_c, { data, rng, heroCategories, date }) {
    const pool = data.heroes.filter((h) => h.eligible && !h.exclude.includes("constellation"));
    if (pool.length < 12) throw new SealedError("not enough heroes");
    const ids = new Set(pool.map((h) => h.id));
    const groups: Facet[] = ((await heroCategories?.()) ?? []).map((g) => ({
      dim: `group:${g.key}`, label: g.label, info: g.info, members: new Set(g.members.filter((id) => ids.has(id))),
    }));
    // Facets that almost everyone (or almost no one) fits make dull or impossible rows.
    const facets = dedupeFacets([...columnFacets(data, pool), ...groups].filter((f) => f.members.size >= 3 && f.members.size <= pool.length - 3));
    const grid = pickGrid(facets, rng);
    if (!grid) throw new SkipCandidate("no fair grid from the current categories");
    const key = `${date}:${[...grid.rows, ...grid.cols].map((f) => f.label).join("|")}`;
    return {
      v: 1, mode: "constellation", key,
      answer: { id: "grid", name: "The full sky", image: null },
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
      ...(done ? { solution: p.clue.solution.map((id, i) => (cells[i] ? null : (({ name, image }) => ({ name, image }))(hero(id)!))) } : {}),
    };
  },
  judge(p, guess, rows) {
    const g = parseGuess(guess);
    if (!g) return { rejected: "Pick a cell first." };
    const done = filled(rows);
    if (done.some(([cell]) => cell === g.cell)) return { rejected: "That cell is already filled." };
    const key = normalizeName(g.text);
    const h = /^\d+$/.test(g.text) ? p.clue.heroes.find((x) => String(x.id) === g.text) : p.clue.heroes.find((x) => x.keys.includes(key));
    if (!h) return { rejected: "No hero by that name." };
    if (done.some(([, id]) => id === h.id)) return { rejected: `${h.name} is already on the board.` };
    if (rows.some((r) => r.id === `${g.cell}:${h.id}`)) return { rejected: `${h.name} was already tried in that cell.` };
    const correct = p.clue.valid[g.cell].includes(h.id);
    return { row: { id: `${g.cell}:${h.id}`, name: h.name, icon: h.image, sub: `Cell ${g.cell + 1}`, correct }, wrong: !correct };
  },
  solved: (_p, rows) => rows.filter((r) => r.correct).length === 9,
  // Partial credit: every filled cell counts, a full grid earns a bonus. Never more than 100.
  souls: (_p, r) => {
    const n = r.rows.filter((x) => x.correct).length;
    return n * PER_CELL_SOULS + (n === 9 ? FULL_GRID_BONUS : 0);
  },
  displayed: (p) => [...p.clue.rows, ...p.clue.cols].map((f) => f.label),
};
