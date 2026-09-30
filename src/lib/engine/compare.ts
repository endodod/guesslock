// Wordle-style attribute comparison (pure; unit-tested).
import type { Arrow, TileResult } from "./types";
import type { CellValue, CompareType } from "./columns";

export function splitMulti(v: CellValue): string[] {
  if (v === null || v === undefined) return [];
  return String(v).split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function compareCell(type: CompareType, guess: CellValue, answer: CellValue): { result: TileResult; arrow?: Arrow } {
  if (guess === null || answer === null || guess === undefined || answer === undefined) return { result: "miss" };
  switch (type) {
    case "exact":
      return { result: String(guess).toLowerCase() === String(answer).toLowerCase() ? "match" : "miss" };
    case "multi": {
      const g = splitMulti(guess), a = splitMulti(answer);
      const same = g.length === a.length && g.every((x) => a.includes(x));
      if (same) return { result: "match" };
      return { result: g.some((x) => a.includes(x)) ? "partial" : "miss" };
    }
    case "numeric": {
      // "none" (e.g. no cooldown) only matches "none"; treat it as 0 for direction.
      if (guess === answer) return { result: "match" };
      const gn = guess === "none" ? 0 : Number(guess);
      const an = answer === "none" ? 0 : Number(answer);
      if (gn === an && guess !== "none" && answer !== "none") return { result: "match" };
      return { result: "miss", arrow: an > gn ? "up" : "down" };
    }
    case "date": {
      const g = String(guess), a = String(answer);
      if (g === a) return { result: "match" };
      return { result: "miss", arrow: a > g ? "up" : "down" };
    }
  }
}

/** The Measure: tolerance is ±10% of the value, at least 1 unit. */
export function measureTolerance(value: number): number {
  return Math.max(1, Math.abs(value) * 0.1);
}

export function checkMeasure(guess: number, value: number): { correct: boolean; exact: boolean; arrow?: Arrow } {
  if (guess === value) return { correct: true, exact: true };
  if (Math.abs(guess - value) <= measureTolerance(value) + 1e-9) return { correct: true, exact: false };
  return { correct: false, exact: false, arrow: value > guess ? "up" : "down" };
}
