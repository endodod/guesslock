// Crossword layout: places words on a grid so that each new word crosses one already placed, the way a hand-made
// crossword reads (no two words touch side by side, so no accidental words form). Pure and deterministic for a seed.
import type { Rng } from "../rng";

export type Dir = "across" | "down";
export type PlacedWord = { n: number; dir: Dir; x: number; y: number; word: string };
export type Layout = { w: number; h: number; words: PlacedWord[] };

type Cell = { letter: string; dirs: Set<Dir> };

const key = (x: number, y: number) => `${x},${y}`;
const step = (dir: Dir) => (dir === "across" ? [1, 0] : [0, 1]);

/**
 * Lays out up to `target` of `words` (in the order given; the caller shuffles). Returns null when fewer than `min` fit
 * within `maxSize` × `maxSize`.
 */
export function layoutCrossword(words: string[], rng: Rng, opts: { target?: number; min?: number; maxSize?: number } = {}): Layout | null {
  const { target = 8, min = 6, maxSize = 13 } = opts;
  const cells = new Map<string, Cell>();
  const placed: Omit<PlacedWord, "n">[] = [];
  let box = { x0: 0, y0: 0, x1: -1, y1: -1 };

  const put = (word: string, x: number, y: number, dir: Dir) => {
    const [dx, dy] = step(dir);
    for (let i = 0; i < word.length; i++) {
      const k = key(x + dx * i, y + dy * i);
      const c = cells.get(k) ?? { letter: word[i], dirs: new Set<Dir>() };
      c.dirs.add(dir);
      cells.set(k, c);
    }
    placed.push({ word, x, y, dir });
    box = placed.length === 1
      ? { x0: x, y0: y, x1: x + dx * (word.length - 1), y1: y + dy * (word.length - 1) }
      : { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + dx * (word.length - 1)), y1: Math.max(box.y1, y + dy * (word.length - 1)) };
  };

  /** Crossings of a valid placement, or -1. */
  const fits = (word: string, x: number, y: number, dir: Dir): number => {
    const [dx, dy] = step(dir);
    const [px, py] = [dy, dx]; // perpendicular
    if (cells.has(key(x - dx, y - dy)) || cells.has(key(x + dx * word.length, y + dy * word.length))) return -1;
    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const cx = x + dx * i, cy = y + dy * i;
      const c = cells.get(key(cx, cy));
      if (c) {
        if (c.letter !== word[i] || c.dirs.has(dir)) return -1;
        crossings++;
      } else if (cells.has(key(cx + px, cy + py)) || cells.has(key(cx - px, cy - py))) {
        return -1;
      }
    }
    const nx0 = Math.min(box.x0, x), ny0 = Math.min(box.y0, y);
    const nx1 = Math.max(box.x1, x + dx * (word.length - 1)), ny1 = Math.max(box.y1, y + dy * (word.length - 1));
    if (nx1 - nx0 + 1 > maxSize || ny1 - ny0 + 1 > maxSize) return -1;
    return crossings;
  };

  const queue = [...words];
  const first = queue.shift();
  if (!first || first.length > maxSize) return null;
  put(first, 0, 0, "across");

  for (const word of queue) {
    if (placed.length >= target) break;
    if (placed.some((p) => p.word === word)) continue;
    let best: { x: number; y: number; dir: Dir; score: number }[] = [];
    let bestScore = -Infinity;
    for (const [k, c] of cells) {
      const [cx, cy] = k.split(",").map(Number);
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== c.letter) continue;
        for (const dir of ["across", "down"] as const) {
          if (c.dirs.has(dir)) continue;
          const [dx, dy] = step(dir);
          const x = cx - dx * i, y = cy - dy * i;
          const crossings = fits(word, x, y, dir);
          if (crossings < 1) continue;
          // Prefer more crossings, then a squarer, smaller grid.
          const w = Math.max(box.x1, x + dx * (word.length - 1)) - Math.min(box.x0, x) + 1;
          const h = Math.max(box.y1, y + dy * (word.length - 1)) - Math.min(box.y0, y) + 1;
          const score = crossings * 20 - w * h * 0.5 - Math.abs(w - h) * 2;
          if (score > bestScore) { bestScore = score; best = [{ x, y, dir, score }]; }
          else if (score === bestScore) best.push({ x, y, dir, score });
        }
      }
    }
    if (best.length) {
      const b = best[rng.int(best.length)];
      put(word, b.x, b.y, b.dir);
    }
  }
  if (placed.length < min) return null;

  // Shift to 0-based coordinates and number the start cells in reading order.
  const shifted = placed.map((p) => ({ ...p, x: p.x - box.x0, y: p.y - box.y0 }));
  const starts = [...new Set(shifted.map((p) => key(p.x, p.y)))]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const number = new Map(starts.map(([x, y], i) => [key(x, y), i + 1]));
  const out = shifted
    .map((p) => ({ n: number.get(key(p.x, p.y))!, dir: p.dir, x: p.x, y: p.y, word: p.word }))
    .sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === "across" ? -1 : 1));
  return { w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1, words: out };
}

/** The letter grid of a layout (null = a black cell). Throws if two words disagree on a cell. */
export function gridOf(layout: Layout): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: layout.h }, () => Array(layout.w).fill(null));
  for (const p of layout.words) {
    const [dx, dy] = step(p.dir);
    for (let i = 0; i < p.word.length; i++) {
      const cur = g[p.y + dy * i][p.x + dx * i];
      if (cur && cur !== p.word[i]) throw new Error(`crossword conflict at ${p.x + dx * i},${p.y + dy * i}`);
      g[p.y + dy * i][p.x + dx * i] = p.word[i];
    }
  }
  return g;
}
