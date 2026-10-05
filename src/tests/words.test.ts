import { describe, expect, it } from "vitest";
import { makeRng } from "@/lib/rng";
import { getLock } from "@/locks.config";
import { evaluate } from "@/lib/engine/play";
import { checkLeaks } from "@/lib/engine/leaks";
import type { BasePayload } from "@/lib/engine/mode";
import type { ItemData } from "@/lib/engine/context";
import { crossword, lexicon, parseCheck, scoreWord } from "@/lib/engine/modes/words";
import { buildCorpus, shortClue, toWord } from "@/lib/words/corpus";
import { gridOf, layoutCrossword } from "@/lib/words/crossword";
import { ability, hero, makeData, noAnalytics } from "./fixtures";

const ctx = (data: ReturnType<typeof makeData>, seed = "s") => ({ data, rng: makeRng(seed), date: "2026-10-01", dayIndex: 0, analytics: noAnalytics });
const row = (payload: unknown, mode: string) => ({ date: "2026-10-01", mode, sealed: false, sealedReason: null, payload });
const none = () => undefined;

const item = (id: number, name: string, description: string) =>
  ({ id, name, aliases: [], exclude: [], attrs: {}, image: null, glyph: null, src: { className: `i${id}`, slot: "spirit", tier: 1, cost: 500, statBonuses: [], componentClassNames: [], description } }) as unknown as ItemData;

const HEROES = ["Abrams", "Bebop", "Dynamo", "Haze", "Infernus", "Kelvin", "Lash", "McGinnis", "Paradox", "Pocket", "Seven", "Vindicta", "Viscous", "Warden", "Wraith", "Yamato", "Grey Talon", "Lady Geist"];
const ITEMS = ["Decay", "Slowing Hex", "Knockdown", "Extra Charge", "Mystic Burst", "Cold Front", "Torment Pulse", "Echo Shard"];

function bigData() {
  const heroes = HEROES.map((n, i) => hero(i + 1, n));
  const texts: Record<string, string> = Object.fromEntries(heroes.map((h) => [`hero_lore:${h.id}`, `A wandering soul from the old city. Number ${h.id} of the Cursed.`]));
  const items = ITEMS.map((n, i) => item(100 + i, n, `Deals damage over time to enemies near ${n}. Stacks twice.`));
  const abilities = [ability(500, 1, 1, "Siphon Life"), ability(501, 2, 1, "Hook")];
  texts["ability_desc:500"] = "Drains health from nearby enemies.";
  texts["ability_desc:501"] = "Pulls an enemy to you.";
  return makeData({ heroes, items, abilities, texts });
}

describe("word list", () => {
  it("writes names as plain letters and skips digits and ampersands", () => {
    expect(toWord("Grey Talon")).toBe("GREYTALON");
    expect(toWord("McGinnis")).toBe("MCGINNIS");
    expect(toWord("Mo & Krill")).toBeNull();
    expect(toWord("Item 7")).toBeNull();
  });

  it("cuts clues at a sentence end", () => {
    expect(shortClue("One. Two two two. " + "X".repeat(200), 20)).toBe("One. Two two two.");
  });

  it("redacts an item's own name from its clue", () => {
    const corpus = buildCorpus(bigData(), "crossword");
    const decay = corpus.find((e) => e.word === "DECAY")!;
    expect(decay.clue).toContain("Spirit item");
    expect(decay.clue).not.toMatch(/decay/i);
  });

  it("skips entities excluded from the mode", () => {
    const data = makeData({ heroes: [hero(1, "Haze", { exclude: ["lexicon"] }), hero(2, "Lash")] });
    expect(buildCorpus(data, "lexicon").map((e) => e.word)).toEqual(["LASH"]);
  });
});

describe("The Lexicon", () => {
  it("colours letters like Wordle, counting repeated letters once each", () => {
    expect(scoreWord("HAZE", "HAZE")).toEqual(["match", "match", "match", "match"]);
    expect(scoreWord("EEZA", "HAZE")).toEqual(["partial", "miss", "match", "partial"]);
    expect(scoreWord("LLLL", "HELL")).toEqual(["miss", "miss", "match", "match"]);
  });

  it("plays to a win and refuses words of the wrong length", () => {
    const data = makeData({ heroes: [hero(1, "Haze")] });
    const lock = getLock("lexicon")!;
    const p = lexicon.build({ answerId: "HAZE", ref: "HAZE" }, ctx(data)) as BasePayload;
    expect(checkLeaks(p)).toEqual([]);
    const v = evaluate(lock, row(p, "lexicon"), 1, ["LASH", "LONGER", "HAZE"], undefined, none);
    expect(v.status).toBe("won");
    expect(v.rows.map((r) => r.id)).toEqual(["LASH", "HAZE"]);
    expect(v.rows[0].tiles?.map((t) => t.result)).toEqual(["miss", "match", "miss", "partial"]);
    expect(v.souls).toBe(90);
    expect(v.answer?.name).toBe("Haze");
  });

  it("jams after six wrong words and unlocks the kind hint after three", () => {
    const data = makeData({ heroes: [hero(1, "Haze")] });
    const lock = getLock("lexicon")!;
    const p = lexicon.build({ answerId: "HAZE", ref: "HAZE" }, ctx(data)) as BasePayload;
    const three = evaluate(lock, row(p, "lexicon"), 1, ["AAAA", "BBBB", "CCCC"], undefined, none);
    expect(three.hints.find((h) => h.id === "kind")).toMatchObject({ unlocked: true, value: "A hero" });
    const six = evaluate(lock, row(p, "lexicon"), 1, ["AAAA", "BBBB", "CCCC", "DDDD", "EEEE", "FFFF", "HAZE"], undefined, none);
    expect(six.status).toBe("lost");
    expect(six.souls).toBe(0);
  });
});

describe("The Crossword", () => {
  it("lays words out so every crossing agrees and no word touches another side by side", () => {
    const words = ["INFERNUS", "VISCOUS", "PARADOX", "KELVIN", "WRAITH", "DYNAMO", "WARDEN", "SEVEN", "YAMATO", "ABRAMS"];
    for (const seed of ["a", "b", "c", "d"]) {
      const layout = layoutCrossword(makeRng(seed).shuffle(words), makeRng(seed), { target: 8, min: 5, maxSize: 13 });
      expect(layout).not.toBeNull();
      const grid = gridOf(layout!);
      expect(layout!.w).toBeLessThanOrEqual(13);
      expect(layout!.h).toBeLessThanOrEqual(13);
      // Every maximal run of letters (length > 1) is one of the placed words.
      const runs: string[] = [];
      for (let y = 0; y < layout!.h; y++) runs.push(...grid[y].map((c) => c ?? " ").join("").split(" ").filter((r) => r.length > 1));
      for (let x = 0; x < layout!.w; x++) runs.push(...grid.map((r) => r[x] ?? " ").join("").split(" ").filter((r) => r.length > 1));
      expect(runs.sort()).toEqual(layout!.words.map((w) => w.word).sort());
    }
  });

  it("is the same for the same seed", () => {
    const data = bigData();
    const a = crossword.build({ answerId: "crossword", ref: 0 }, ctx(data, "day1")) as BasePayload;
    const b = crossword.build({ answerId: "crossword", ref: 0 }, ctx(data, "day1")) as BasePayload;
    expect(a).toEqual(b);
  });

  it("never names a word of the grid in a clue", () => {
    const data = bigData();
    for (const seed of ["x", "y", "z"]) {
      const p = crossword.build({ answerId: "crossword", ref: 0 }, ctx(data, seed)) as BasePayload;
      expect(checkLeaks(p)).toEqual([]);
    }
  });

  it("locks right words in, charges a pick for a check with a wrong word, and wins on a full grid", () => {
    const data = bigData();
    const lock = getLock("crossword")!;
    const p = crossword.build({ answerId: "crossword", ref: 0 }, ctx(data, "play")) as BasePayload<{ words: { word: string }[] }>;
    const words = p.clue.words.map((w) => w.word);
    const blank = words.map((w) => ".".repeat(w.length));
    const only = (i: number, text: string) => blank.map((b, j) => (j === i ? text : b)).join("|");
    expect(parseCheck(only(0, words[0]), p.clue.words)).not.toBeNull();
    expect(parseCheck("AB", p.clue.words)).toBeNull();

    const firstRight = only(0, words[0]);
    const secondWrong = only(1, "Z".repeat(words[1].length));
    const v = evaluate(lock, row(p, "crossword"), 1, [firstRight, secondWrong], undefined, none);
    expect(v.status).toBe("playing");
    expect(v.wrong).toBe(1);
    const clue = v.clue as Extract<NonNullable<typeof v.clue>, { kind: "crossword" }>;
    expect(clue.words[0].solved).toBe(words[0]);
    expect(clue.words[1].solved).toBeNull();
    // Unsolved answers never reach the player.
    expect(JSON.stringify(clue)).not.toContain(words[1]);

    const won = evaluate(lock, row(p, "crossword"), 1, [firstRight, secondWrong, words.join("|")], undefined, none);
    expect(won.status).toBe("won");
    expect(won.souls).toBe(90);
  });
});

describe("word list clues", () => {
  it("drops a clue that is only a blacked-out name", () => {
    const data = makeData({ heroes: [hero(1, "Haze"), hero(2, "Lash")], texts: { "hero_lore:1": "▇▇▇.", "hero_lore:2": "A brawler who fell from the sky and never stopped falling." } });
    const corpus = buildCorpus(data, "crossword");
    expect(corpus.find((e) => e.word === "HAZE")?.clue).toBeNull();
    expect(corpus.find((e) => e.word === "LASH")?.clue).toContain("Hero:");
  });
});
