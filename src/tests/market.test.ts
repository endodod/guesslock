import { describe, expect, it } from "vitest";
import { CASES, COSMETICS, casePool, rollCase, RARITY_ORDER } from "@/lib/market/catalog";
import { makeRng } from "@/lib/rng";

describe("The Black Market catalog", () => {
  it("odds add up to 1 and every case can drop every rarity", () => {
    for (const c of CASES) {
      expect(RARITY_ORDER.reduce((a, r) => a + c.odds[r], 0)).toBeCloseTo(1);
      for (const r of RARITY_ORDER) expect(casePool(c)[r].length, `${c.id} ${r}`).toBeGreaterThan(0);
    }
    expect(new Set(COSMETICS.map((c) => c.key)).size).toBe(COSMETICS.length);
  });

  it("draws follow the published odds and stay inside the case's slots", () => {
    const rng = makeRng("market");
    for (const c of CASES) {
      const n = 20000;
      const seen: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const item = rollCase(c, rng.next(), rng.next());
        expect(c.slots).toContain(item.slot);
        seen[item.rarity] = (seen[item.rarity] ?? 0) + 1;
      }
      for (const r of RARITY_ORDER) expect(Math.abs((seen[r] ?? 0) / n - c.odds[r])).toBeLessThan(0.015);
    }
  });

  it("rolls at the edges stay valid", () => {
    for (const c of CASES) {
      expect(rollCase(c, 0, 0)).toBeTruthy();
      expect(rollCase(c, 0.999999, 0.999999).rarity).toBe("legendary");
    }
  });
});
