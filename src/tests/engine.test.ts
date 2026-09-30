import { describe, expect, it } from "vitest";
import { makeRng, puzzleSeed } from "@/lib/rng";
import { noRepeatWindow, orderCandidates, selectAnswer } from "@/lib/engine/select";
import { compareCell, checkMeasure } from "@/lib/engine/compare";
import { addDays, dayInZone, nextResetAt, startOfDay } from "@/lib/time";
import type { Candidate } from "@/lib/engine/mode";

const pool: Candidate[] = Array.from({ length: 30 }, (_, i) => ({ answerId: String(i + 1), ref: i + 1 }));

describe("seeded selection", () => {
  it("same date + mode + salt -> same answer", () => {
    const seed = puzzleSeed("2026-10-01", "visage", "salt");
    expect(selectAnswer(pool, [], seed)).toEqual(selectAnswer([...pool].reverse(), [], seed));
  });

  it("different dates or modes usually differ", () => {
    const picks = new Set(Array.from({ length: 20 }, (_, i) => selectAnswer(pool, [], puzzleSeed(addDays("2026-10-01", i), "visage", "s"))!.answerId));
    expect(picks.size).toBeGreaterThan(10);
    expect(selectAnswer(pool, [], puzzleSeed("2026-10-01", "sigil", "s"))).toBeDefined();
  });

  it("rng is deterministic", () => {
    const a = makeRng("x"), b = makeRng("x");
    expect([a.next(), a.next(), a.int(10)]).toEqual([b.next(), b.next(), b.int(10)]);
  });
});

describe("no-repeat window", () => {
  it("window is min(60, pool * 0.6), with per-lock override", () => {
    expect(noRepeatWindow(38, 60)).toBe(22);
    expect(noRepeatWindow(200, 60)).toBe(60);
    expect(noRepeatWindow(40, 60, 10)).toBe(10);
    expect(noRepeatWindow(5, 60, 10)).toBe(4);
  });

  it("never picks a recent answer while fresh ones exist", () => {
    const recent = pool.slice(0, 25).map((c) => c.answerId);
    for (let i = 0; i < 50; i++) {
      const pick = selectAnswer(pool, recent, `seed-${i}`)!;
      expect(recent).not.toContain(pick.answerId);
    }
  });

  it("falls back to the full pool when everything is recent", () => {
    const recent = pool.map((c) => c.answerId);
    expect(selectAnswer(pool, recent, "s")).not.toBeNull();
    expect(orderCandidates(pool, recent, "s")).toHaveLength(pool.length);
  });

  it("simulated 60 days: no repeats inside the window", () => {
    const history: string[] = [];
    const win = noRepeatWindow(pool.length, 60);
    for (let d = 0; d < 60; d++) {
      const pick = selectAnswer(pool, history.slice(-win), `day-${d}`)!.answerId;
      expect(history.slice(-win)).not.toContain(pick);
      history.push(pick);
    }
  });
});

describe("wordle comparison", () => {
  it("exact", () => {
    expect(compareCell("exact", "Male", "male").result).toBe("match");
    expect(compareCell("exact", "Female", "male").result).toBe("miss");
  });
  it("multi: match / partial / miss", () => {
    expect(compareCell("multi", "Human, Undead", "undead, human").result).toBe("match");
    expect(compareCell("multi", "Human", "Human, Undead").result).toBe("partial");
    expect(compareCell("multi", "Frog", "Human").result).toBe("miss");
  });
  it("numeric arrows point toward the answer", () => {
    expect(compareCell("numeric", 700, 800)).toEqual({ result: "miss", arrow: "up" });
    expect(compareCell("numeric", 900, 800)).toEqual({ result: "miss", arrow: "down" });
    expect(compareCell("numeric", 800, 800).result).toBe("match");
    expect(compareCell("numeric", "none", 20)).toEqual({ result: "miss", arrow: "up" });
    expect(compareCell("numeric", "none", "none").result).toBe("match");
  });
  it("dates", () => {
    expect(compareCell("date", "2024-08-01", "2025-01-10")).toEqual({ result: "miss", arrow: "up" });
    expect(compareCell("date", "2025-01-10", "2025-01-10").result).toBe("match");
  });
  it("missing values never match", () => {
    expect(compareCell("exact", null, null).result).toBe("miss");
  });
});

describe("The Measure tolerance", () => {
  it("±10%, at least 1 unit", () => {
    expect(checkMeasure(25, 25)).toEqual({ correct: true, exact: true });
    expect(checkMeasure(27, 25).correct).toBe(true);
    expect(checkMeasure(28, 25)).toEqual({ correct: false, exact: false, arrow: "down" });
    expect(checkMeasure(3, 2).correct).toBe(true); // min 1 unit
    expect(checkMeasure(4, 2).correct).toBe(false);
    expect(checkMeasure(200, 250).arrow).toBe("up");
  });
});

describe("timezone", () => {
  it("Zurich day boundary", () => {
    expect(dayInZone(new Date("2026-09-30T21:59:00Z"), "Europe/Zurich")).toBe("2026-09-30");
    expect(dayInZone(new Date("2026-09-30T22:00:00Z"), "Europe/Zurich")).toBe("2026-10-01");
    expect(startOfDay("2026-10-01", "Europe/Zurich").toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(startOfDay("2026-12-01", "Europe/Zurich").toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(nextResetAt(new Date("2026-10-25T12:00:00Z"), "Europe/Zurich").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});
