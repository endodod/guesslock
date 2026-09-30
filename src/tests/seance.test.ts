import { describe, expect, it } from "vitest";
import { LOCK_BY_SLUG, isSeance } from "@/locks.config";
import { makeRng } from "@/lib/rng";
import { BOARD, checkBoard, countSolutions, generateBoard, rankGroups, repeatWindow } from "@/lib/seance/board";
import { deriveCategories, BEHAVIOUR_ALLOWLIST } from "@/lib/seance/derive";
import { evaluateSeance, seanceLeaks } from "@/lib/seance/play";
import { completeness, reconcileMemberships, statusAfterSync, usableCategories, type CategoryRow } from "@/lib/seance/rules";
import { boxSouls, foldPlays, shareTable, tableSouls, tableSymbol } from "@/lib/seance/scoring";
import { HINT_ENTRY, type LibraryCategory, type SeancePayload } from "@/lib/seance/types";
import { dayTotals, shareDay } from "@/lib/game/scoring";
import { daySouls } from "@/lib/client/store";

// ───────────── fixtures ─────────────

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const hero = (id: number) => ({ id, name: `Hero ${id}`, image: `/media/h${id}` });

let nextId = 1;
const cat = (type: LibraryCategory["type"], label: string, difficulty: number, members: number[]): LibraryCategory =>
  ({ id: nextId++, type, label, explanation: `${label}, explained`, difficulty, members });

/** A small library with overlapping categories (so boards have red herrings). */
const LIBRARY: LibraryCategory[] = [
  cat("mechanics", "Archetype: A", 1, range(1, 9)),
  cat("mechanics", "Archetype: B", 1, range(10, 18)),
  cat("mechanics", "Archetype: C", 1, range(19, 27)),
  cat("mechanics", "Archetype: D", 1, range(28, 36)),
  cat("mechanics", "Heals allies", 2, [2, 11, 20, 29, 30]),
  cat("mechanics", "Multiple charges", 3, [3, 4, 12, 21, 31, 32]),
  cat("mechanics", "Stuns", 3, [5, 13, 14, 22, 33, 6]),
  cat("mechanics", "Complexity 3", 2, [7, 15, 16, 23, 24, 34, 35]),
  cat("mechanics", "Base health under 700", 4, [8, 17, 25, 36]),
  cat("mechanics", "Self-cast", 4, [9, 18, 26, 27, 1]),
  cat("visuals", "Wears a hat", 2, [1, 10, 19, 28, 5]),
  cat("visuals", "Glowing eyes", 3, [2, 12, 22, 32]),
  cat("lore", "Not from this plane", 3, [3, 13, 23, 33, 34]),
  cat("lore", "Works in law enforcement", 2, [4, 14, 24, 35]),
];

function board(seed: string, table: "mechanics" | "mixed" = "mechanics", recent = new Set<number>()) {
  return generateBoard({ table, categories: LIBRARY, hero: (id) => hero(id), recent, rng: makeRng(seed) });
}

function rowFor(p: SeancePayload, slug = "seance-mechanics") {
  return { date: "2026-10-02", mode: slug, sealed: false, sealedReason: null, payload: p };
}

const lock = LOCK_BY_SLUG["seance-mechanics"];
const firstBoard = (() => {
  for (let i = 0; i < 50; i++) {
    const r = board(`fixture-${i}`);
    if (r.ok) return r.payload;
  }
  throw new Error("fixture library produced no board");
})();

// ───────────── config ─────────────

describe("Séance lock config", () => {
  it("four internal tables share one box and one numeral", () => {
    const tables = ["seance-mechanics", "seance-visuals", "seance-lore", "seance-mixed"];
    for (const s of tables) {
      expect(isSeance(s)).toBe(true);
      expect(LOCK_BY_SLUG[s].box).toBe("seance");
      expect(LOCK_BY_SLUG[s].maxTries).toBe(4);
    }
    expect(new Set(tables.map((s) => LOCK_BY_SLUG[s].numeral)).size).toBe(1);
  });
});

// ───────────── solver ─────────────

describe("uniqueness solver", () => {
  const S = (...xs: number[]) => new Set(xs);
  it("0 solutions: a hero fits no category", () => {
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4), S(5, 6, 7)], 4)).toBe(0);
  });
  it("0 solutions: capacities can't be met", () => {
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4, 5, 6, 7, 8), S(1, 2)], 4)).toBe(0);
  });
  it("exactly 1 solution with a red herring", () => {
    // Hero 5 also fits the first category, but the first already needs 1–4.
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4, 5), S(5, 6, 7, 8)], 4)).toBe(1);
  });
  it("several solutions: two interchangeable heroes", () => {
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4, 5), S(4, 5, 6, 7, 8)], 4)).toBe(2);
  });
  it("identical categories are ambiguous", () => {
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4, 5, 6, 7, 8), S(1, 2, 3, 4, 5, 6, 7, 8)], 4)).toBe(70);
  });
  it("respects the limit", () => {
    expect(countSolutions([1, 2, 3, 4, 5, 6, 7, 8], [S(1, 2, 3, 4, 5, 6, 7, 8), S(1, 2, 3, 4, 5, 6, 7, 8)], 4, 2)).toBe(2);
  });
});

// ───────────── generation ─────────────

describe("board generation", () => {
  const boards = Array.from({ length: 40 }, (_, i) => board(`day-${i}`)).filter((r) => r.ok).map((r) => (r as { payload: SeancePayload }).payload);

  it("finds boards for most seeds", () => {
    expect(boards.length).toBeGreaterThan(30);
  });

  it("every generated board has exactly one solution", () => {
    for (const p of boards) {
      const cats = p.groups.map((g) => LIBRARY.find((c) => c.id === g.categoryId)!);
      expect(checkBoard(cats, p.groups.map((g) => g.members)).solutions).toBe(1);
      expect(new Set(p.heroes.map((h) => h.id)).size).toBe(16);
      expect(p.groups.every((g) => g.members.length === 4)).toBe(true);
    }
  });

  it("red herrings stay within 2–5", () => {
    for (const p of boards) {
      expect(p.redHerrings).toBeGreaterThanOrEqual(BOARD.minHerrings);
      expect(p.redHerrings).toBeLessThanOrEqual(BOARD.maxHerrings);
    }
  });

  it("is deterministic per seed (including the difficulty ranking)", () => {
    expect(board("same-seed")).toEqual(board("same-seed"));
    const p = firstBoard;
    expect(p.groups.map((g) => g.rank)).toEqual([1, 2, 3, 4]);
  });

  it("ranks by difficulty plus a red-herring bonus, ties by category id", () => {
    expect(rankGroups([
      { categoryId: 1, difficulty: 3, decoys: 0 },
      { categoryId: 2, difficulty: 1, decoys: 0 },
      { categoryId: 3, difficulty: 1, decoys: 3 },
      { categoryId: 4, difficulty: 2, decoys: 0 },
    ])).toEqual([4, 1, 3, 2]);
    expect(rankGroups([
      { categoryId: 9, difficulty: 2, decoys: 0 },
      { categoryId: 5, difficulty: 2, decoys: 0 },
      { categoryId: 7, difficulty: 1, decoys: 0 },
      { categoryId: 8, difficulty: 4, decoys: 0 },
    ])).toEqual([3, 2, 1, 4]);
  });

  it("avoids recently used categories while fresh ones can make a board", () => {
    const recent = new Set(firstBoard.groups.map((g) => g.categoryId));
    for (let i = 0; i < 10; i++) {
      const r = board(`fresh-${i}`, "mechanics", recent);
      if (r.ok) for (const g of r.payload.groups) expect(recent.has(g.categoryId)).toBe(false);
    }
    expect(repeatWindow(10)).toBe(1);
    expect(repeatWindow(80)).toBe(14);
    expect(repeatWindow(3)).toBe(0);
  });

  it("mixed tables use at least 3 category types", () => {
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const r = board(`mixed-${i}`, "mixed");
      if (!r.ok) continue;
      found++;
      const types = new Set(r.payload.groups.map((g) => LIBRARY.find((c) => c.id === g.categoryId)!.type));
      expect(types.size).toBeGreaterThanOrEqual(3);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("seals a table whose type has too few categories", () => {
    const r = generateBoard({ table: "visuals", categories: LIBRARY, hero, recent: new Set(), rng: makeRng("x") });
    expect(r.ok).toBe(false);
  });
});

// ───────────── completeness ─────────────

describe("category completeness", () => {
  const rows = (members: number[], heroes: number[], status = "approved"): CategoryRow => ({
    id: 1, type: "visuals", label: "Wears a hat", explanation: null, difficulty: 2, status,
    memberships: heroes.map((h) => ({ heroId: h, member: members.includes(h), source: "admin" })),
  });

  it("a category with any unknown membership is never used", () => {
    const r = rows([1, 2, 3, 4], range(1, 9));
    expect(usableCategories([r], range(1, 10))).toEqual([]); // hero 10 unknown
    expect(completeness(r.memberships, range(1, 10)).unknown).toEqual([10]);
    expect(usableCategories([r], range(1, 9))).toHaveLength(1);
  });

  it("drafts and retired categories are never used", () => {
    expect(usableCategories([rows([1, 2, 3, 4], range(1, 9), "draft")], range(1, 9))).toEqual([]);
    expect(usableCategories([rows([1, 2, 3, 4], range(1, 9), "retired")], range(1, 9))).toEqual([]);
  });

  it("a hero added by a sync makes every category incomplete until classified", () => {
    const heroes = range(1, 9);
    const library = [rows([1, 2, 3, 4], heroes), { ...rows([5, 6, 7, 8], heroes), id: 2 }];
    expect(usableCategories(library, heroes)).toHaveLength(2);
    const afterSync = [...heroes, 99];
    expect(usableCategories(library, afterSync)).toEqual([]);
    library[0].memberships.push({ heroId: 99, member: false, source: "admin" });
    expect(usableCategories(library, afterSync).map((c) => c.id)).toEqual([1]);
  });

  it("members exclude inactive heroes", () => {
    const r = rows([1, 2, 3, 4, 5], range(1, 9));
    expect(usableCategories([r], range(2, 9))[0].members).toEqual([2, 3, 4, 5]);
  });
});

// ───────────── API derivation ─────────────

describe("API-derived categories", () => {
  const h = (id: number, extra: Record<string, unknown> = {}) => ({
    id, name: `H${id}`, class_name: `hero_${id}`, player_selectable: true, hero_type: id % 2 ? "marksman" : "mystic",
    gun_tag: "Pistol", complexity: 1, tags: ["Initiator"], items: { signature1: `ab_${id}` }, starting_stats: { max_health: { value: 700 + id * 10 } },
    ...extra,
  });
  const ability = (id: number, behaviours: string[], props: Record<string, unknown> = {}) => ({ class_name: `ab_${id}`, behaviours, properties: props });
  const heroes = [h(1), h(2), h(3), h(4), h(5, { hero_type: null, items: {} })];
  const items = [
    ability(1, ["CITADEL_ABILITY_BEHAVIOR_PREVENT_BOT_USAGE", "CITADEL_ABILITY_BEHAVIOR_CAN_HEAL_PLAYERS"]),
    ability(2, ["CITADEL_ABILITY_BEHAVIOR_CLEAVE_DISABLED", "CITADEL_ABILITY_BEHAVIOR_EXCLUSIVE_USE"], { AbilityCharges: { value: "2" } }),
    ability(3, ["CITADEL_ABILITY_BEHAVIOR_DISPLAYS_DAMAGE_IMPACT"], { StunDuration: { value: 1 } }),
    ability(4, []),
  ];
  const derived = deriveCategories(heroes, items);

  it("never derives a category from a non-allowlisted behaviour flag", () => {
    const behaviourKeys = derived.filter((c) => c.key.startsWith("derived:behaviour:")).map((c) => c.key.replace("derived:behaviour:", ""));
    for (const k of behaviourKeys) expect(Object.keys(BEHAVIOUR_ALLOWLIST)).toContain(k);
    expect(derived.some((c) => /PREVENT_BOT|CLEAVE|EXCLUSIVE|DISPLAYS_DAMAGE/.test(c.key))).toBe(false);
  });

  it("derives allowlisted flags, charges, stuns, archetypes and stat cuts", () => {
    const by = new Map(derived.map((c) => [c.key, c]));
    expect(by.get("derived:behaviour:CITADEL_ABILITY_BEHAVIOR_CAN_HEAL_PLAYERS")!.members.get(1)).toBe(true);
    expect(by.get("derived:behaviour:CITADEL_ABILITY_BEHAVIOR_CAN_HEAL_PLAYERS")!.members.get(2)).toBe(false);
    expect(by.get("derived:charges")!.members.get(2)).toBe(true);
    expect(by.get("derived:stun")!.members.get(3)).toBe(true);
    expect(by.get("api:hero_type:marksman")!.members.get(1)).toBe(true);
    expect(by.get("api:tag:Initiator")!.members.get(4)).toBe(true);
  });

  it("missing API data is unknown, never no", () => {
    const by = new Map(derived.map((c) => [c.key, c]));
    expect(by.get("api:hero_type:marksman")!.members.get(5)).toBeNull();
    expect(by.get("derived:charges")!.members.get(5)).toBeNull(); // no abilities
  });

  it("sync reconciliation: API rows follow the API, admin rows win, unknowns are deleted", () => {
    const existing = [
      { heroId: 1, member: true, source: "derived" },
      { heroId: 2, member: false, source: "derived" },
      { heroId: 3, member: true, source: "admin" },
      { heroId: 4, member: true, source: "derived" },
    ];
    const r = reconcileMemberships(existing, new Map([[1, true], [2, true], [3, false], [4, null], [5, true]]));
    expect(r.upserts).toEqual([{ heroId: 2, member: true }, { heroId: 5, member: true }]);
    expect(r.deletes).toEqual([4]);
    expect(r.added).toEqual([2, 5]);
    expect(r.removed).toEqual([4]);
  });

  it("a change only un-approves below 4 members", () => {
    expect(statusAfterSync("approved", 4)).toBe("approved");
    expect(statusAfterSync("approved", 3)).toBe("draft");
    expect(statusAfterSync("retired", 2)).toBe("retired");
  });
});

// ───────────── server checks ─────────────

describe("Séance play (server)", () => {
  const p = firstBoard;
  const row = rowFor(p);
  const [g1, g2, g3, g4] = p.groups;
  const pick = (ids: number[]) => ids.join(",");
  const wrong = pick([g2.members[0], g3.members[0], g4.members[0], g2.members[1]]);
  const oneAway = pick([...g2.members.slice(0, 3), g3.members[0]]);
  const ev = (entries: string[], noHints = false) => evaluateSeance(lock, row, 7, entries, { noHints });

  it("correct / one away / wrong", () => {
    const { view } = ev([pick(g1.members), oneAway, wrong]);
    expect(view.history.map((h) => h.result)).toEqual(["correct", "one-away", "wrong"]);
    expect(view.mistakes).toBe(2);
    expect(view.groups.map((g) => g.rank)).toEqual([1]);
    expect(view.status).toBe("playing");
  });

  it("a repeated submission (any order) is rejected without a penalty", () => {
    const again = pick([...wrong.split(",").map(Number)].reverse());
    const { view, accepted } = ev([wrong, again]);
    expect(view.mistakes).toBe(1);
    expect(accepted).toEqual([wrong]);
  });

  it("invalid picks are ignored: off-board heroes, solved heroes, duplicates", () => {
    const { view } = ev([pick(g1.members), pick([999, 998, 997, 996]), pick([g1.members[0], ...g2.members.slice(0, 3)]), "1,1,1,1", "junk"]);
    expect(view.history).toHaveLength(1);
    expect(view.mistakes).toBe(0);
  });

  it("wins with all four groups; souls follow the table formula", () => {
    const { view } = ev([wrong, pick(g4.members), pick(g3.members), pick(g2.members), pick(g1.members)]);
    expect(view.status).toBe("won");
    expect(view.souls).toBe(80);
    expect(view.groups.every((g) => g.found)).toBe(true);
  });

  it("the 4th mistake loses the table and reveals the rest in color order", () => {
    const w2 = pick([g2.members[0], g3.members[0], g4.members[0], g3.members[1]]);
    const w3 = pick([g2.members[0], g3.members[0], g4.members[0], g4.members[1]]);
    const w4 = pick([g2.members[1], g3.members[1], g4.members[1], g2.members[2]]);
    const { view } = ev([pick(g1.members), wrong, w2, w3, w4, pick(g2.members)]);
    expect(view.status).toBe("lost");
    expect(view.mistakes).toBe(4);
    expect(view.history).toHaveLength(5); // nothing after the loss counts
    expect(view.groups.map((g) => [g.rank, g.found])).toEqual([[1, true], [2, false], [3, false], [4, false]]);
    expect(view.souls).toBe(10);
  });

  it("hint: only after 2 mistakes, once, easiest unsolved group, not in no-hints mode", () => {
    expect(ev([HINT_ENTRY]).view.hint.used).toBe(false);
    const w2 = pick([g2.members[0], g3.members[0], g4.members[0], g3.members[1]]);
    const base = [pick(g1.members), wrong, w2];
    expect(ev(base).view.hint.available).toBe(true);
    const { view } = ev([...base, HINT_ENTRY, HINT_ENTRY]);
    expect(view.hint.used).toBe(true);
    expect(view.hint.label).toBe(g2.label);
    expect(view.hintsUsed).toBe(1);
    const off = ev([...base, HINT_ENTRY], true).view;
    expect(off.hint.available).toBe(false);
    expect(off.hint.used).toBe(false);
    expect(JSON.stringify(off)).not.toContain(g2.label);
  });

  it("unsolved group memberships and labels never appear in any response", () => {
    const states = [[], [wrong], [oneAway], [pick(g1.members)], [pick(g1.members), wrong, oneAway]];
    for (const entries of states) {
      const { view } = ev(entries);
      const json = JSON.stringify(view);
      const solved = view.groups.map((g) => g.rank);
      for (const g of p.groups) {
        if (solved.includes(g.rank)) continue;
        expect(json).not.toContain(JSON.stringify(g.label));
        expect(json).not.toContain(JSON.stringify(g.explanation));
      }
      expect(view.share).toBeUndefined();
      expect(view.groups.every((g) => g.found)).toBe(true);
      expect(json).not.toMatch(/categoryId|difficulty|redHerrings/);
    }
    expect(seanceLeaks(lock, row)).toEqual([]);
  });

  it("sealed tables send nothing", () => {
    const { view } = evaluateSeance(lock, { ...row, sealed: true, sealedReason: "no board", payload: {} }, 1, []);
    expect(view.status).toBe("sealed");
    expect(view.heroes).toEqual([]);
  });
});

// ───────────── scoring & share ─────────────

describe("Séance scoring", () => {
  it("win and loss formulas with the hint penalty", () => {
    expect(tableSouls({ won: true, mistakes: 0, hints: 0, groupsFound: 4 })).toBe(100);
    expect(tableSouls({ won: true, mistakes: 1, hints: 0, groupsFound: 4 })).toBe(80);
    expect(tableSouls({ won: true, mistakes: 3, hints: 1, groupsFound: 4 })).toBe(25);
    expect(tableSouls({ won: true, mistakes: 3, hints: 0, groupsFound: 4 })).toBe(40);
    expect(tableSouls({ won: false, mistakes: 4, hints: 1, groupsFound: 2 })).toBe(20);
    expect(tableSouls({ won: false, mistakes: 4, hints: 0, groupsFound: 0 })).toBe(0);
  });

  it("the Séance box is the rounded average of the tables in play", () => {
    expect(boxSouls([100, 80, 45, 0], 4)).toBe(56);
    expect(boxSouls([100, 55], 2)).toBe(78); // two tables sealed that day
    expect(boxSouls([100], 4)).toBe(25); // unfinished tables count 0
    expect(boxSouls([], 0)).toBe(0);
  });

  it("folds the tables into one box for leaderboards and the Vault", () => {
    const plays = [
      { date: "d1", lock: "reckoning", souls: 90, status: "won" },
      { date: "d1", lock: "seance-mechanics", souls: 100, status: "won" },
      { date: "d1", lock: "seance-lore", souls: 20, status: "lost" },
      { date: "d2", lock: "seance-mechanics", souls: 80, status: "won" },
    ];
    const inPlay = (d: string) => (d === "d1" ? 2 : 4);
    expect(foldPlays(plays, isSeance, inPlay)).toEqual({ souls: 90 + 60 + 20, opened: 2 });
  });

  it("dayTotals/daySouls agree on the box value", () => {
    const results = {
      reckoning: { status: "won" as const, guesses: 2, souls: 90 },
      "seance-mechanics": { status: "won" as const, guesses: 5, souls: 80, mistakes: 1 },
      "seance-visuals": { status: "lost" as const, guesses: 6, souls: 10, mistakes: 4 },
    };
    expect(dayTotals(results, 2)).toEqual({ souls: 135, opened: 2 });
    const day = {
      reckoning: { g: ["1", "2"], s: "won" as const, w: 1, h: 0, souls: 90 },
      "seance-mechanics": { g: [], s: "won" as const, w: 1, h: 0, souls: 80, tables: 2 },
      "seance-visuals": { g: [], s: "lost" as const, w: 4, h: 0, souls: 10, tables: 2 },
    };
    expect(daySouls(day)).toBe(135);
  });
});

describe("Séance share", () => {
  const p = firstBoard;
  const [g1, g2, g3] = p.groups;
  const oneAway = [...g2.members.slice(0, 3), g3.members[0]].join(",");

  it("per-table grid matches the submission history and has no labels or names", () => {
    const { view } = evaluateSeance(lock, rowFor(p), 142, [oneAway, g1.members.join(","), ...p.groups.slice(1).map((g) => g.members.join(","))]);
    expect(view.status).toBe("won");
    const text = shareTable({ number: 142, table: "Lore", rows: view.share!, won: true, mistakes: view.mistakes, souls: view.souls!, site: "guesslock.paulkuehn.ch" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("GUESSLOCK #142 — The Séance · Lore");
    expect(lines[1]).toBe("🟩🟩🟩🟦");
    expect(lines[2]).toBe("🟨🟨🟨🟨");
    expect(lines.slice(1, 6)).toHaveLength(5);
    expect(lines.at(-2)).toBe("1 mistake · 80 souls");
    for (const g of p.groups) expect(text).not.toContain(g.label);
    for (const h of p.heroes) expect(text).not.toContain(h.name);
  });

  it("combined daily share: one symbol per table", () => {
    expect(tableSymbol({ status: "won", mistakes: 0 })).toBe("✨");
    expect(tableSymbol({ status: "won", mistakes: 2 })).toBe("🔓");
    expect(tableSymbol({ status: "lost", mistakes: 4 })).toBe("🔒");
    const text = shareDay({
      number: 3, streak: 1, site: "x", seanceInPlay: 4,
      results: {
        "seance-mechanics": { status: "won", guesses: 4, souls: 100, mistakes: 0 },
        "seance-visuals": { status: "won", guesses: 6, souls: 60, mistakes: 2 },
        "seance-lore": { status: "lost", guesses: 5, souls: 0, mistakes: 4 },
        "seance-mixed": { status: "won", guesses: 4, souls: 100, mistakes: 0 },
      },
    });
    expect(text).toContain("Séance   ✨🔓🔒✨");
    expect(text).toContain("1/17 locks · 65 souls");
  });
});
