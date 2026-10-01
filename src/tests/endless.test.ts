import { describe, expect, it } from "vitest";
import { emptyEndless, recordEndless } from "@/lib/client/endless";
import { ENDLESS_LOCKS } from "@/lib/endless";
import type { LockRecord } from "@/lib/client/store";

const rec = (s: LockRecord["s"]): LockRecord => ({ g: ["1"], s, w: 0, h: 0, souls: s === "won" ? 100 : 0 });

describe("Endless mode", () => {
  it("offers every guessing lock, not the Omens or the sorting tables", () => {
    const slugs = ENDLESS_LOCKS.map((l) => l.slug);
    expect(slugs).toContain("reckoning");
    expect(slugs).toContain("wayfinder");
    expect(slugs.some((s) => ["clash", "beast", "rift"].includes(s) || s.startsWith("seance-"))).toBe(false);
  });

  it("counts a finished puzzle once, tracks streaks and remembers recent answers", () => {
    let d = emptyEndless();
    d = recordEndless(d, "relic", "t1", rec("playing"));
    expect(d.stats.relic).toBeUndefined();
    d = recordEndless(d, "relic", "t1", rec("won"), "a");
    d = recordEndless(d, "relic", "t1", rec("won"), "a"); // a restore of the same puzzle
    expect(d.stats.relic).toEqual({ played: 1, won: 1, streak: 1, best: 1 });
    d = recordEndless(d, "relic", "t2", rec("won"), "b");
    d = recordEndless(d, "relic", "t3", rec("lost"), "c");
    expect(d.stats.relic).toEqual({ played: 3, won: 2, streak: 0, best: 2 });
    expect(d.recent.relic).toEqual(["c", "b", "a"]);
  });
});
