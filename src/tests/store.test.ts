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

describe("progress backup", async () => {
  const { backupFile, emptyStore, mergeStores, readBackup } = await import("@/lib/client/store");
  const rec = (s: "playing" | "won" | "lost", g: number) => ({ g: Array.from({ length: g }, (_, i) => String(i)), s, w: 0, h: 0, souls: s === "won" ? 50 : 0 });

  it("round-trips through the backup file and rejects other files", () => {
    const store = { ...emptyStore(), progress: { "2026-10-01": { reckoning: rec("won", 3) } } };
    const back = readBackup(backupFile(store, { stats: {} }))!;
    expect(back.store.progress["2026-10-01"].reckoning.s).toBe("won");
    expect(back.endless).toEqual({ stats: {} });
    expect(readBackup("{\"hello\":1}")).toBeNull();
    expect(readBackup("not json")).toBeNull();
  });

  it("merging keeps whichever record got further, never downgrading a finished lock", () => {
    const local = { ...emptyStore(), progress: { "2026-10-01": { reckoning: rec("won", 3), visage: rec("playing", 1) } } };
    const incoming = { ...emptyStore(), progress: { "2026-10-01": { reckoning: rec("playing", 5), visage: rec("lost", 6) }, "2026-10-02": { sigil: rec("won", 1) } } };
    const m = mergeStores(local, incoming);
    expect(m.progress["2026-10-01"].reckoning.s).toBe("won");
    expect(m.progress["2026-10-01"].visage.s).toBe("lost");
    expect(m.progress["2026-10-02"].sigil.s).toBe("won");
  });
});

describe("guest mode", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const rec = { g: ["1"], s: "won" as const, w: 0, h: 0, souls: 100 };

  it("keeps progress in the tab only, never touches what the device saved, but remembers settings", async () => {
    const { vi } = await import("vitest");
    const local = memory(), session = memory();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session, dispatchEvent: () => true });
    try {
      const { loadStore, saveStore, emptyStore, STORE_KEY, GUEST_KEY } = await import("@/lib/client/store");
      const device = emptyStore();
      device.progress = { "2026-09-30": { reckoning: rec } };
      saveStore(device);
      const guest = loadStore(true);
      expect(guest.progress).toEqual({});
      saveStore({ ...guest, progress: { "2026-10-01": { visage: rec } }, settings: { ...guest.settings, sound: true } }, true);
      // The device still holds only its own progress, plus the new setting.
      const onDevice = JSON.parse(local.getItem(STORE_KEY)!);
      expect(Object.keys(onDevice.progress)).toEqual(["2026-09-30"]);
      expect(onDevice.settings.sound).toBe(true);
      // The guest's progress is in the tab and comes back on reload.
      expect(JSON.parse(session.getItem(GUEST_KEY)!)["2026-10-01"].visage.s).toBe("won");
      expect(Object.keys(loadStore(true).progress)).toEqual(["2026-10-01"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
