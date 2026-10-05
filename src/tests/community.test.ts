import { describe, expect, it } from "vitest";
import { CommunityInput, textProblem } from "@/lib/community/rules";
import { checkGrid, type Facet } from "@/lib/engine/modes/constellation";
import { evaluateCommunity } from "@/lib/community/service";
import type { SeancePayload } from "@/lib/seance/types";

const facet = (dim: string, label: string, members: number[]): Facet => ({ dim, label, info: "", members: new Set(members) });

describe("community text checks", () => {
  it("accepts plain names and refuses links, slurs and empty or long text", () => {
    expect(textProblem("Shoots fire", "Name", 40)).toBeNull();
    expect(textProblem("", "Name", 40)).toMatch(/missing/);
    expect(textProblem("", "Explanation", 40, false)).toBeNull();
    expect(textProblem("x".repeat(41), "Name", 40)).toMatch(/too long/);
    expect(textProblem("see www.example.com", "Name", 40)).toMatch(/links/);
    expect(textProblem("R e t a r d s", "Name", 40)).toMatch(/don't allow/);
  });

  it("requires four groups of four", () => {
    const g = { label: "A", members: [1, 2, 3, 4] };
    expect(CommunityInput.safeParse({ kind: "seance", entity: "hero", title: "T", groups: [g, g, g, g] }).success).toBe(true);
    expect(CommunityInput.safeParse({ kind: "seance", entity: "hero", title: "T", groups: [g, g, g] }).success).toBe(false);
    expect(CommunityInput.safeParse({ kind: "seance", entity: "hero", title: "T", groups: [g, g, g, { label: "B", members: [1, 2, 3] }] }).success).toBe(false);
  });
});

describe("hand-picked Constellations", () => {
  // Heroes 1-12; rows by one dimension, columns by others, every cell with two heroes.
  const rows = [facet("a", "A1", [1, 2, 3, 4, 5, 6]), facet("b", "B1", [7, 8, 9, 10, 11, 12]), facet("c", "C1", [1, 2, 7, 8, 13, 14])];
  const cols = [facet("d", "D1", [1, 7, 3, 9, 2, 8]), facet("e", "E1", [2, 8, 4, 10, 13, 1]), facet("f", "F1", [5, 6, 11, 12, 14, 7])];

  it("accepts a fair, solvable grid", () => {
    const r = checkGrid(rows, cols);
    expect("error" in r ? r.error : null).toBeNull();
    if (!("error" in r)) expect(new Set(r.solution).size).toBe(9);
  });

  it("refuses two categories of the same kind and thin cells", () => {
    expect(checkGrid(rows, [cols[0], cols[1], facet("a", "A2", [1, 2])])).toEqual({ error: expect.stringMatching(/different kind/) });
    expect(checkGrid(rows, [cols[0], cols[1], facet("g", "G1", [5])])).toEqual({ error: expect.stringMatching(/fewer than/) });
  });

  it("refuses near-identical categories and a row inside a column", () => {
    // "Gender: Female" and "Female heroes" from two sources, one hero apart.
    expect(checkGrid(rows, [cols[0], cols[1], facet("g", "A1 again", [1, 2, 3, 4, 5])])).toEqual({ error: expect.stringMatching(/nearly the same/) });
    // Every hero of C1 is also in the column: that cell would only ask for C1.
    const wide = facet("g", "G1", [1, 2, 7, 8, 13, 14, 5, 11, 4, 10]);
    expect(checkGrid(rows, [cols[0], cols[1], wide])).toEqual({ error: expect.stringMatching(/asks only one thing/) });
  });
});

describe("community sorting tables", () => {
  const heroes = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, image: null }));
  const payload: SeancePayload = {
    v: 1, mode: "seance", entity: "hero", table: "mixed", source: "community", authorUserId: "u1", heroes, redHerrings: 0,
    groups: [0, 1, 2, 3].map((g) => ({ categoryId: g + 1, label: `Group ${g + 1}`, explanation: null, difficulty: g + 1, rank: (g + 1) as 1 | 2 | 3 | 4, members: [1, 2, 3, 4].map((k) => g * 4 + k) })),
  };

  it("plays like a daily table and keeps unsolved names secret", () => {
    const start = evaluateCommunity("seance", payload, []);
    expect(start.kind).toBe("seance");
    expect(JSON.stringify(start.view)).not.toContain("Group 1");
    const won = evaluateCommunity("seance", payload, ["1,2,3,4", "5,6,7,8", "9,10,11,12", "13,14,15,16"]);
    expect(won.view.status).toBe("won");
  });
});
