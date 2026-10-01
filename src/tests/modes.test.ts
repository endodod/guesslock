import { describe, expect, it } from "vitest";
import { cipher, colloquy, echo, hideHalf, reckoning, slotName, utterance } from "@/lib/engine/modes/hero";
import { CENSOR } from "@/lib/text/redact";
import type { VoiceEntryData } from "@/lib/engine/context";
import { measure, isCleanStat } from "@/lib/engine/modes/item";
import { makeRng } from "@/lib/rng";
import { checkLeaks } from "@/lib/engine/leaks";
import { evaluate } from "@/lib/engine/play";
import { LOCK_BY_SLUG } from "@/locks.config";
import { shareDay, shareLock, soulsFor } from "@/lib/game/scoring";
import type { BasePayload } from "@/lib/engine/mode";
import type { ItemData } from "@/lib/engine/context";
import { ability, hero, makeData, noAnalytics } from "./fixtures";

const ctx = (data: ReturnType<typeof makeData>, seed = "s") => ({ data, rng: makeRng(seed), date: "2026-10-01", dayIndex: 0, analytics: noAnalytics });
const lookup = (data: ReturnType<typeof makeData>) => (id: string) => {
  const h = data.hero(Number(id));
  return h ? { id, name: h.name, icon: null } : undefined;
};

describe("The Cipher", () => {
  const set = ["🎩", "🐦", "🌙", "🏹", "🦉", "🪶", "🌲", "🪃", "🦌", "🪤"];
  const talon = hero(17, "Grey Talon", { emojis: set, emojisReviewed: true });
  const data = makeData({
    heroes: [
      talon,
      hero(1, "Infernus", { emojis: ["🔥", "💨", "🏃", "💥", "☄️", "😈"], emojisReviewed: true }), // incomplete (6 < 10)
      hero(2, "Seven", { emojis: ["🎩", "⚡", "🌩️", "🏙️", "🎭", "🔌", "🎲", "🌀", "💡", "⛈️"], emojisReviewed: false }), // no review needed
      hero(3, "Excluded", { emojis: set, exclude: ["emoji"] }),
    ],
  });

  it("only heroes with a complete 10-emoji set are eligible (no review gate)", () => {
    expect(cipher.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([17, 2]);
  });

  it("shows 5 of the 10, hardest first, always ending with one of the 3 most obvious", async () => {
    const seen = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data, seed));
      const picked = (cipher.clue(p, 9, false) as { slots: string[] }).slots;
      expect(picked).toHaveLength(5);
      const idx = picked.map((e) => set.indexOf(e));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(idx[4]).toBeGreaterThanOrEqual(7);
      seen.add(picked.join(""));
    }
    expect(seen.size).toBeGreaterThan(1); // not the same every time
  });

  it("reveals one per wrong guess and freezes only the 5 picked", async () => {
    const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data));
    const slots = (w: number) => (cipher.clue(p, w, false) as { slots: (string | null)[] }).slots;
    expect(slots(0).filter(Boolean)).toHaveLength(1);
    expect(slots(2).filter(Boolean)).toHaveLength(3);
    expect(p.clue.emojis).toHaveLength(5);
  });

  it("hints: gender after 6, first letter after 8 wrong guesses", async () => {
    const p = await cipher.build({ answerId: "17", ref: 17 }, ctx(data));
    const row = { date: "2026-10-01", mode: "cipher", sealed: false, sealedReason: null, payload: p };
    const v = evaluate(LOCK_BY_SLUG.cipher, row, 1, ["1", "2", "3"], undefined, lookup(data));
    expect(v.hints.every((h) => !h.unlocked)).toBe(true);
    expect(LOCK_BY_SLUG.cipher.hints.map((h) => h.after)).toEqual([6, 8]);
  });

  it("share text never contains the emoji set", () => {
    const text = shareLock({ lock: LOCK_BY_SLUG.cipher, number: 1, result: { status: "won", guesses: 3, souls: 80 }, site: "x" });
    for (const e of set) expect(text).not.toContain(e);
    const day = shareDay({ number: 1, results: { cipher: { status: "won", guesses: 3, souls: 80 } }, streak: 1, site: "x" });
    for (const e of set) expect(day).not.toContain(e);
  });
});

describe("The Echo family", () => {
  const entry = (id: number, kind: "select" | "cast" | "convo", over: Partial<VoiceEntryData> = {}): VoiceEntryData => ({
    id, kind, fileKey: `f${id}`, abilityId: null, abilitySlot: null, otherHeroId: null, text: `This is voice line number ${id}.`, lines: null, ...over,
  });
  const haze = hero(13, "Haze", { aliases: ["Sandman"] });
  const abrams = hero(1, "Abrams");
  const quiet = hero(5, "Quiet");
  const abilities = [ability(131, 13, 2, "Smoke Bomb"), ability(132, 13, 4, "Bullet Dance")];
  const selects = Array.from({ length: 8 }, (_, i) => entry(i + 1, "select"));
  const casts = Array.from({ length: 6 }, (_, i) => entry(20 + i, "cast", { abilityId: 131, abilitySlot: 2 }));
  const convo = entry(40, "convo", {
    otherHeroId: 1, text: null,
    lines: [{ h: 1, t: "Hey, you. Abrams here." }, { h: 13, t: "Can't talk, busy." }, { h: 1, t: "Fair enough, Abrams out." }],
  });
  const data = makeData({
    heroes: [haze, abrams, quiet], abilities,
    entries: { "13:select": selects, "13:cast": casts, "13:convo": [convo], "5:select": selects.slice(0, 3), "1:convo": [{ ...convo, id: 41, otherHeroId: 13 }] },
  });

  it("Select: needs 5 lines; builds 5 and reveals one more per wrong guess", async () => {
    expect(echo.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([13]);
    const p = await echo.build({ answerId: "13", ref: 13 }, ctx(data));
    expect(p.clue.lines).toHaveLength(5);
    expect((echo.clue(p, 0, false) as { lines: unknown[] }).lines).toHaveLength(1);
    expect((echo.clue(p, 3, false) as { lines: unknown[] }).lines).toHaveLength(4);
  });

  it("Select hard mode blacks out the start or end of each line, until the win", async () => {
    const p = await echo.build({ answerId: "13", ref: 13 }, ctx(data));
    const hard = echo.clue(p, 1, false, true) as { lines: { text: string }[] };
    expect(hard.lines.every((l) => l.text.includes(CENSOR))).toBe(true);
    expect(hard.lines[0].text.startsWith(CENSOR)).toBe(true);
    expect(hard.lines[1].text.endsWith(CENSOR)).toBe(true);
    expect((echo.clue(p, 1, true, true) as { lines: { text: string }[] }).lines.every((l) => !l.text.includes(CENSOR))).toBe(true);
    expect(hideHalf("a b c d", 0)).toBe(`${CENSOR} c d`);
    expect(hideHalf("a b c d", 1)).toBe(`a b ${CENSOR}`);
  });

  it("Utterance: lines of one ability, its slot shown; hard mode hides the slot", async () => {
    expect(utterance.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([13]);
    const p = await utterance.build({ answerId: "13", ref: 13 }, ctx(data));
    expect(p.clue.lines).toHaveLength(5);
    expect(p.clue.slot).toBe(2);
    expect(p.bonus!.reveal!.name).toBe("Smoke Bomb");
    expect((utterance.clue(p, 0, false) as { note?: string }).note).toBe("Said when casting Ability 2");
    expect((utterance.clue(p, 0, false, true) as { note?: string }).note).not.toContain("2");
    expect((utterance.clue(p, 0, true, true) as { note?: string }).note).toContain("Ability 2");
    expect(slotName(4)).toBe("the Ultimate");
  });

  it("Colloquy: names the other hero, hides them in hard mode and blanks their name in the lines", async () => {
    expect(colloquy.candidates(data, { dayIndex: 0 }).map((c) => c.ref).sort()).toEqual([1, 13]);
    const p = await colloquy.build({ answerId: "13", ref: 13 }, ctx(data));
    const easy = colloquy.clue(p, 0, false) as { kind: string; lines: { mine: boolean; text: string }[]; other: { name: string } | null };
    expect(easy.other?.name).toBe("Abrams");
    expect(easy.lines).toHaveLength(1);
    expect(easy.lines[0].mine).toBe(false);
    const hard = colloquy.clue(p, 2, false, true) as typeof easy;
    expect(hard.other).toBeNull();
    expect(hard.lines.map((l) => l.mine)).toEqual([false, true, false]);
    expect(JSON.stringify(hard)).not.toContain("Abrams");
    expect(JSON.stringify(colloquy.clue(p, 2, true, true))).toContain("Abrams");
  });

  it("leak validation catches an unredacted name in a displayed line", async () => {
    const leaky = makeData({ heroes: [haze], entries: { "13:select": Array.from({ length: 6 }, (_, i) => entry(i + 1, "select", { text: `Haze says line ${i} out loud.` })) } });
    const p = await echo.build({ answerId: "13", ref: 13 }, ctx(leaky));
    expect(checkLeaks(p as BasePayload).length).toBeGreaterThan(0);
    for (const mode of [echo, utterance, colloquy]) {
      const clean = await mode.build({ answerId: "13", ref: 13 }, ctx(data));
      expect(checkLeaks(clean as BasePayload)).toEqual([]);
    }
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
    id, name: `Item ${id}`, aliases: [], exclude: [], attrs: {}, image: null, glyph: null,
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

describe("Letter hints", () => {
  const set = ["🎩", "🐦", "🌙", "🏹", "🦉", "🪶", "🌲", "🪃", "🦌", "🪤"];
  const data = makeData({ heroes: [hero(17, "Grey Talon", { emojis: set, emojisReviewed: true }), hero(1, "Infernus"), hero(2, "Seven"), hero(3, "Mo & Krill", { emojis: set }),
    ...Array.from({ length: 8 }, (_, i) => hero(101 + i, `Decoy ${i}`))] });
  const row = async (id: number) => ({ date: "2026-10-01", mode: "cipher", sealed: false, sealedReason: null, payload: await cipher.build({ answerId: String(id), ref: id }, ctx(data)) });
  const wrong = (n: number) => ["1", "2", "3", "4", "5", "6", "7", "8"].slice(0, n).map((x) => String(Number(x) + 100));

  it("unlock first letter, then first two letters, from the answer name", async () => {
    const lock = LOCK_BY_SLUG.cipher; // hints after 6 and 8 wrong guesses
    const at = (n: number) => evaluate(lock, row17, 1, wrong(n), undefined, lookup(data)).hints;
    const row17 = await row(17);
    expect(at(5).map((h) => h.value)).toEqual([undefined, undefined]);
    expect(at(6).map((h) => h.value)).toEqual(["G", undefined]);
    expect(at(8).map((h) => h.value)).toEqual(["G", "GR"]);
    const mo = evaluate(lock, await row(3), 1, wrong(8), undefined, lookup(data)).hints;
    expect(mo.map((h) => h.value)).toEqual(["M", "MO"]);
  });

  it("every guessing lock uses the two letter hints (The Visage's zoom-out is enough: none)", () => {
    for (const l of Object.values(LOCK_BY_SLUG).filter((x) => x.picks > 0 && !x.maxTries))
      expect(l.hints.map((h) => h.id)).toEqual(l.slug === "visage" ? [] : ["initial", "initial2"]);
  });
});

describe("Giving up", () => {
  const set = ["🎩", "🐦", "🌙", "🏹", "🦉", "🪶", "🌲", "🪃", "🦌", "🪤"];
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
    expect((v.clue as { slots: (string | null)[] }).slots.every(Boolean)).toBe(true);
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
  it("has 10 distinct emojis per hero and no two heroes share their first 3", async () => {
    const { DEFAULT_EMOJIS } = await import("@/lib/data/emojis");
    const firsts = new Map<string, string>();
    for (const [hero, set] of Object.entries(DEFAULT_EMOJIS)) {
      expect(set, hero).toHaveLength(10);
      expect(new Set(set).size, hero).toBe(10);
      const key = set.slice(0, 3).join("");
      expect(firsts.get(key), `${hero} vs ${firsts.get(key)}`).toBeUndefined();
      firsts.set(key, hero);
    }
  });
});
