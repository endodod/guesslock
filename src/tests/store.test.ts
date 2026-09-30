import { describe, expect, it } from "vitest";
import { adoptServerProgress, lockStats, migrateStore, streaks } from "@/lib/client/store";

describe("adopting account progress", () => {
  it("server wins per day+lock; local-only records stay", () => {
    const local = {
      "2026-09-29": { visage: { g: ["1"], s: "playing" as const, w: 1, h: 0, souls: 0 } },
      "2026-09-30": { relic: { g: ["5"], s: "won" as const, w: 0, h: 0, souls: 100 } },
    };
    const server = {
      "2026-09-29": { visage: { g: ["1", "2"], s: "won" as const, w: 1, h: 0, souls: 90, ranked: true } },
      "2026-09-28": { sigil: { g: ["3"], s: "won" as const, w: 0, h: 0, souls: 100 } },
    };
    const out = adoptServerProgress(local, server);
    expect(out["2026-09-29"].visage.g).toEqual(["1", "2"]);
    expect(out["2026-09-29"].visage.ranked).toBe(true);
    expect(out["2026-09-30"].relic.souls).toBe(100);
    expect(out["2026-09-28"].sigil.s).toBe("won");
    expect(local["2026-09-29"].visage.g).toEqual(["1"]); // input not mutated
  });
});

describe("local data migration (11 -> 13 locks)", () => {
  it("stats saved under the old 11-lock numbering load under slugs", () => {
    const legacy = {
      version: 1,
      onboarded: true,
      settings: { colorblind: true },
      progress: {
        "2026-09-01": {
          VIII: { g: ["a", "b"], s: "won", w: 1, h: 0, souls: 90 }, // old VIII = The Relic
          XI: { g: ["1", "2", "3", "4", "5"], s: "lost", w: 5, h: 0, souls: 0 }, // old XI = The Measure
          I: { g: ["x"], s: "won", w: 0, h: 0, souls: 100 },
        },
      },
    };
    const s = migrateStore(legacy);
    expect(s.version).toBe(2);
    expect(Object.keys(s.progress["2026-09-01"]).sort()).toEqual(["measure", "reckoning", "relic"]);
    expect(s.progress["2026-09-01"].relic.souls).toBe(90);
    expect(s.settings.colorblind).toBe(true);
    expect(s.settings.sound).toBe(false);
    expect(s.onboarded).toBe(true);
  });

  it("v2 data (slug keys) is untouched; unknown keys and junk are dropped", () => {
    const s = migrateStore({ version: 2, progress: { "2026-09-02": { cipher: { g: ["1"], s: "won", w: 0, h: 0, souls: 100 }, bogus: { g: [] } }, nope: {} } });
    expect(Object.keys(s.progress)).toEqual(["2026-09-02"]);
    expect(Object.keys(s.progress["2026-09-02"])).toEqual(["cipher"]);
    expect(migrateStore(null).progress).toEqual({});
    expect(migrateStore("garbage").version).toBe(2);
  });
});

describe("streaks and stats", () => {
  const rec = (s: "won" | "lost", n = 2, archive = false) => ({ g: Array(n).fill("x"), s, w: n - 1, h: 0, souls: s === "won" ? 90 : 0, archive });
  const progress = {
    "2026-09-27": { visage: rec("won") },
    "2026-09-28": { visage: rec("won"), measure: rec("lost", 5) },
    "2026-09-29": { measure: rec("lost", 5) }, // no win: breaks the streak
    "2026-09-30": { visage: rec("won", 1) },
    "2026-10-01": { visage: rec("won", 3, true) }, // archive replay: ignored
  };

  it("a day counts if at least one lock is solved; archive replays don't count", () => {
    const st = streaks(progress, "2026-10-01");
    expect(st.current).toBe(1);
    expect(st.best).toBe(2);
    expect(st.days).toBe(3);
  });

  it("per-lock stats", () => {
    const v = lockStats(progress, "visage", "2026-09-30");
    expect(v.played).toBe(3);
    expect(v.winRate).toBe(100);
    expect(v.dist).toEqual({ "2": 2, "1": 1 });
    const m = lockStats(progress, "measure", "2026-09-30");
    expect(m.winRate).toBe(0);
    expect(m.dist.X).toBe(2);
  });
});
