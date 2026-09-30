import { describe, expect, it } from "vitest";
import { cipher, echo, pickEchoLines, reckoning } from "@/lib/engine/modes/hero";
import { measure, isCleanStat } from "@/lib/engine/modes/item";
import { makeRng } from "@/lib/rng";
import { checkLeaks } from "@/lib/engine/leaks";
import { evaluate } from "@/lib/engine/play";
import { LOCK_BY_SLUG } from "@/locks.config";
import { shareDay, shareLock, soulsFor } from "@/lib/game/scoring";
import type { BasePayload } from "@/lib/engine/mode";
import type { ItemData } from "@/lib/engine/context";
import { hero, makeData, noAnalytics } from "./fixtures";

const ctx = (data: ReturnType<typeof makeData>, seed = "s") => ({ data, rng: makeRng(seed), date: "2026-10-01", dayIndex: 0, analytics: noAnalytics });
const lookup = (data: ReturnType<typeof makeData>) => (id: string) => {
  const h = data.hero(Number(id));
  return h ? { id, name: h.name, icon: null } : undefined;
};

describe("The Cipher", () => {
  const set = ["🎩", "🐦", "🌙", "🏹", "🦉", "🪶"];
  const talon = hero(17, "Grey Talon", { emojis: set, emojisReviewed: true });
  const data = makeData({
    heroes: [
      talon,
      hero(1, "Infernus", { emojis: ["🔥"], emojisReviewed: true }), // incomplete set
      hero(2, "Seven", { emojis: ["🎩", "⚡", "🌩️", "🏙️", "🎭", "7️⃣"], emojisReviewed: false }), // no review needed
      hero(3, "Excluded", { emojis: set, exclude: ["emoji"] }),
    ],
  });

  it("only heroes with a complete set are eligible (no review gate)", () => {
    expect(cipher.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([17, 2]);
  });

  it("reveals in stored order, one per wrong guess", async () => {
    const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data));
    const slots = (w: number) => (cipher.clue(p, w, false) as { slots: (string | null)[] }).slots;
    expect(slots(0)).toEqual(["🎩", null, null, null, null, null]);
    expect(slots(2)).toEqual(["🎩", "🐦", "🌙", null, null, null]);
    expect(slots(9)).toEqual(set);
  });

  it("hints: gender after 7, first letter after 9 wrong guesses", async () => {
    const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data));
    const row = { date: "2026-10-01", mode: "cipher", sealed: false, sealedReason: null, payload: p };
    const wrongs = ["1", "2", "3"];
    const v = evaluate(LOCK_BY_SLUG.cipher, row, 1, wrongs, undefined, lookup(data));
    expect(v.hints.every((h) => !h.unlocked)).toBe(true);
    expect(LOCK_BY_SLUG.cipher.hints.map((h) => h.after)).toEqual([7, 9]);
  });

  it("share text never contains the emoji set", () => {
    const text = shareLock({ lock: LOCK_BY_SLUG.cipher, number: 1, result: { status: "won", guesses: 3, souls: 80 }, site: "x" });
    for (const e of set) expect(text).not.toContain(e);
    const day = shareDay({ number: 1, results: { cipher: { status: "won", guesses: 3, souls: 80 } }, streak: 1, site: "x" });
    for (const e of set) expect(day).not.toContain(e);
  });
});

describe("The Echo", () => {
  const lines = (n: number, starred = 0, text = (i: number) => `This is voice line number ${i} for testing today.`) =>
    Array.from({ length: n }, (_, i) => ({ id: i, text: text(i), audio: null, starred: i < starred }));
  const haze = hero(13, "Haze", { aliases: ["Sandman"] });
  const generic = hero(99, "Boho", { genericVoice: true });
  const data = makeData({
    heroes: [haze, generic, hero(5, "Quiet")],
    lines: { 13: lines(12, 1), 99: lines(20), 5: lines(3) },
  });

  it("generic-voice heroes and heroes with < 5 lines are never picked", () => {
    expect(echo.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([13]);
  });

  it("picks 4 regular lines then the starred one last", () => {
    const picked = pickEchoLines(lines(12, 1), makeRng("x"));
    expect(picked).toHaveLength(5);
    expect(picked[4].text).toBe(lines(1)[0].text);
    expect(picked.slice(0, 4).some((l) => l.text === lines(1)[0].text)).toBe(false);
  });

  it("audio hint falls back to gender when no audio exists", async () => {
    const p = await echo.build({ answerId: "13", ref: 13 }, ctx(data));
    expect(p.hints.audio).toEqual({ value: "Male" }); // fixture: odd ids are male
    const withAudio = makeData({ heroes: [haze], lines: { 13: lines(6).map((l) => ({ ...l, audio: "/media/abc" })) } });
    const p2 = await echo.build({ answerId: "13", ref: 13 }, ctx(withAudio));
    expect(p2.hints.audio).toEqual({ label: "Voice clip", audio: "/media/abc" });
  });

  it("leak validation catches an unredacted name in a displayed line", async () => {
    const leaky = makeData({ heroes: [haze], lines: { 13: lines(6, 0, (i) => `Haze says line ${i} out loud right now.`) } });
    const p = await echo.build({ answerId: "13", ref: 13 }, ctx(leaky));
    expect(checkLeaks(p as BasePayload).length).toBeGreaterThan(0);
    const clean = await echo.build({ answerId: "13", ref: 13 }, ctx(data));
    expect(checkLeaks(clean as BasePayload)).toEqual([]);
  });
});

describe("The Reckoning", () => {
  it("curated columns join only once every hero has a value; tiles compare correctly", async () => {
    const a = hero(1, "Abrams"), c = hero(3, "Calico", { species: "Human, Cat" });
    const full = makeData({ heroes: [a, c] });
    const p = await reckoning.build({ answerId: "3", ref: 3 }, ctx(full));
    const tiles = reckoning.tiles!(p, "1")!;
    expect(tiles.find((t) => t.key === "species")!.result).toBe("partial");
    expect(tiles.find((t) => t.key === "health")!.arrow).toBe("up");

    // One hero without species: the lock still opens, just without the species column.
    const partial = makeData({ heroes: [a, hero(2, "Bebop", { species: null }), c] });
    expect(reckoning.candidates(partial, { dayIndex: 0 }).map((x) => x.ref)).toEqual([1, 2, 3]);
    const p2 = await reckoning.build({ answerId: "2", ref: 2 }, ctx(partial));
    expect(p2.clue.columns.map((col) => col.key)).not.toContain("species");
    expect(p2.clue.columns.map((col) => col.key)).toContain("release");

    // A hero missing an API column (e.g. no weapon type) stays guessable but isn't an answer.
    const noGun = makeData({ heroes: [a, hero(4, "Rem", { weaponType: null })] });
    expect(reckoning.candidates(noGun, { dayIndex: 0 }).map((x) => x.ref)).toEqual([1]);
  });
});

describe("The Measure", () => {
  const item = (id: number, stats: { label: string; value: number; conditional?: boolean; scales?: boolean }[]): ItemData => ({
    id, name: `Item ${id}`, aliases: [], exclude: [], image: null, glyph: null,
    src: {
      id, className: `i${id}`, name: `Item ${id}`, slot: "weapon", tier: 1, cost: 800, activation: "passive", isActive: false,
      componentClassNames: [], image: null, glyph: null, cooldown: null, description: "",
      statBonuses: stats.map((s) => ({ key: s.label, label: s.label, value: s.value, display: `+${s.value}%`, prefix: "", postfix: "%", conditional: !!s.conditional, scales: !!s.scales })),
    },
  });

  it("only clean stats qualify, and loss after 5 tries", async () => {
    expect(isCleanStat({ key: "", label: "", value: 1.25, display: "", prefix: "", postfix: "", conditional: false, scales: false })).toBe(false);
    const data = makeData({ heroes: [], items: [item(1, [{ label: "Fire Rate", value: 20 }, { label: "Spirit", value: 10, scales: true }])] });
    const p = await measure.build({ answerId: "1", ref: 1 }, ctx(data));
    expect(p.clue.stats[p.clue.hiddenIndex].label).toBe("Fire Rate");
    const row = { date: "2026-10-01", mode: "measure", sealed: false, sealedReason: null, payload: p };
    const lost = evaluate(LOCK_BY_SLUG.measure, row, 1, ["1", "2", "3", "4", "5", "20"], undefined, () => undefined);
    expect(lost.status).toBe("lost");
    expect(lost.rows).toHaveLength(5);
    const won = evaluate(LOCK_BY_SLUG.measure, row, 1, ["50", "21"], undefined, () => undefined);
    expect(won.status).toBe("won");
    expect(won.rows[1].close).toBe(true);
    expect((won.clue as { stats: { display: string | null }[] }).stats[p.clue.hiddenIndex].display).toBe("+20%");
  });
});

describe("souls", () => {
  it("formula", () => {
    expect(soulsFor({ won: true, guesses: 1, hintsUsed: 0 })).toBe(100);
    expect(soulsFor({ won: true, guesses: 4, hintsUsed: 1 })).toBe(55);
    expect(soulsFor({ won: true, guesses: 20, hintsUsed: 2 })).toBe(10);
    expect(soulsFor({ won: true, guesses: 2, hintsUsed: 0, bonusCorrect: true })).toBe(115);
    expect(soulsFor({ won: false, guesses: 5, hintsUsed: 0 })).toBe(0);
  });
});

describe("Giving up", () => {
  const set = ["🎩", "🐦", "🌙", "🏹", "🦉", "🪶"];
  const data = makeData({ heroes: [hero(17, "Grey Talon", { emojis: set, emojisReviewed: true }), hero(1, "Infernus"), hero(2, "Seven")] });
  const build = async () => {
    const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data));
    return { date: "2026-10-01", mode: "cipher", sealed: false, sealedReason: null, payload: p };
  };

  it("jams the lock and reveals the answer after at least one guess", async () => {
    const v = evaluate(LOCK_BY_SLUG.cipher, await build(), 1, ["1"], undefined, lookup(data), { giveUp: true });
    expect(v.status).toBe("lost");
    expect(v.gaveUp).toBe(true);
    expect(v.answer?.name).toBe("Grey Talon");
    expect((v.clue as { slots: (string | null)[] }).slots).toEqual(set);
  });

  it("is ignored without a guess, and a correct guess still wins", async () => {
    const row = await build();
    expect(evaluate(LOCK_BY_SLUG.cipher, row, 1, [], undefined, lookup(data), { giveUp: true }).status).toBe("playing");
    const won = evaluate(LOCK_BY_SLUG.cipher, row, 1, ["1", "17"], undefined, lookup(data), { giveUp: true });
    expect(won.status).toBe("won");
    expect(won.gaveUp).toBeUndefined();
  });
});

describe("The Cipher default emoji sets", () => {
  it("has 6 emojis per hero and no two heroes share their first 3", async () => {
    const { DEFAULT_EMOJIS } = await import("@/lib/data/emojis");
    const firsts = new Map<string, string>();
    for (const [hero, set] of Object.entries(DEFAULT_EMOJIS)) {
      expect(set, hero).toHaveLength(6);
      expect(new Set(set).size, hero).toBe(6);
      const key = set.slice(0, 3).join("");
      expect(firsts.get(key), `${hero} vs ${firsts.get(key)}`).toBeUndefined();
      firsts.set(key, hero);
    }
  });
});
