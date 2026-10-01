import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { makeRng } from "@/lib/rng";
import { LOCK_BY_SLUG } from "@/locks.config";
import { evaluate } from "@/lib/engine/play";
import { checkLeaks } from "@/lib/engine/leaks";
import { hardHiddenColumns, type BasePayload } from "@/lib/engine/mode";
import { shadow, arsenal } from "@/lib/engine/modes/sight";
import { calculus, CALCULUS_MIN_STATS } from "@/lib/engine/modes/calculus";
import { decoy, fakeCandidates } from "@/lib/engine/modes/decoy";
import { cache, finalInventory, teamProblem } from "@/lib/engine/modes/cache";
import { constellation, dedupeFacets, normalizeName, pickGrid, solveGrid, type Facet } from "@/lib/engine/modes/constellation";
import { reckoning } from "@/lib/engine/modes/hero";
import { buildTimeline } from "@/lib/omens/ingest";
import { decodePng, encodePng, silhouette } from "@/lib/image/png";
import { blur, cover, crop, opaqueBox, outlineOrigin } from "@/lib/image/clue";
import { abilityStats } from "@/lib/deadlock/normalize";
import { hardSouls } from "@/lib/game/scoring";
import type { ItemData } from "@/lib/engine/context";
import { ability, hero, makeData, noAnalytics } from "./fixtures";

const ctx = (data: ReturnType<typeof makeData>, seed = "s", extra = {}) => ({ data, rng: makeRng(seed), date: "2026-10-01", dayIndex: 0, analytics: noAnalytics, ...extra });
const row = (payload: unknown, mode: string) => ({ date: "2026-10-01", mode, sealed: false, sealedReason: null, payload });
const heroLookup = (data: ReturnType<typeof makeData>) => (id: string) => {
  const h = data.hero(Number(id));
  return h ? { id, name: h.name, icon: null } : undefined;
};

// ───────────── images ─────────────

/** 8 × 8 RGBA: a 4 × 6 opaque block (x 2-5, y 2-7) on a transparent ground. */
function block() {
  const data = new Uint8Array(8 * 8 * 4);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 6; x++) data.set([200, 50, 50, 255], (y * 8 + x) * 4);
  return { width: 8, height: 8, data };
}

describe("PNG codec and clue images", () => {
  it("round-trips RGBA through encode and decode", () => {
    const img = block();
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(8);
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true);
  });

  it("silhouettes keep the shape and drop every colour; images without transparency are refused", () => {
    const s = silhouette(block())!;
    expect(s.data[(3 * 8 + 3) * 4 + 3]).toBe(255);
    expect(s.data[0 + 3]).toBe(0);
    expect(new Set(Array.from({ length: 64 }, (_, i) => s.data[i * 4])).size).toBe(1);
    const opaque = { width: 2, height: 2, data: new Uint8Array(16).fill(255) };
    expect(silhouette(opaque)).toBeNull();
  });

  it("crops the window a CSS zoom would show, and anchors silhouettes on their outline", () => {
    const c = crop(block(), { zoom: 2, originX: 0, originY: 0 });
    expect([c.width, c.height]).toEqual([4, 4]);
    expect(opaqueBox(block())).toEqual({ x0: 2, y0: 2, x1: 5, y1: 7 });
    // The shape's top edge is at y = 2 (25%): the origin lands there, inside the shape's columns.
    const o = outlineOrigin(block(), 50);
    expect(o.originY).toBe(25);
    expect(o.originX).toBeGreaterThanOrEqual(25);
    expect(o.originX).toBeLessThanOrEqual(75);
  });

  it("covers tiles and blurs without changing the size", () => {
    const covered = cover(block(), 2, [0]);
    expect(covered.data[(1 * 8 + 1) * 4 + 3]).toBe(255); // top-left quarter painted
    const b = blur({ width: 256, height: 8, data: new Uint8Array(256 * 8 * 4).fill(255) }, 4);
    expect([b.width, b.height]).toEqual([256, 8]);
  });
});

// ───────────── The Shadow & The Arsenal ─────────────

describe("The Shadow and The Arsenal", () => {
  const data = makeData({ heroes: [hero(1, "Haze"), hero(2, "Seven", { weapon: `/media/${"a".repeat(40)}` }), hero(3, "Paige", { shadow: null })] });

  it("pools: every hero with a portrait; The Arsenal only heroes with curated weapon art", () => {
    expect(shadow.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([1, 2]);
    expect(arsenal.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([2]);
  });

  it("shows the whole silhouette from the start in normal mode, zooms out in hard mode and only shows colour when finished", async () => {
    const urls = { n: 0 };
    const images = {
      crops: async (_u: string, steps: unknown[]) => steps.map(() => `/media/${String(urls.n++).padStart(40, "0")}`),
      copy: async () => `/media/${"f".repeat(40)}`,
    };
    const p = await shadow.build({ answerId: "1", ref: 1 }, ctx(data, "s", { images }));
    expect(p.clue.normal).toHaveLength(1);
    expect(new Set([...p.clue.normal, ...p.clue.hard]).size).toBe(7);
    const at = (w: number, hard = false, done = false) => shadow.clue(p, w, done, { hard }) as { image: string; silhouette?: boolean };
    expect(at(0).image).toBe(p.clue.normal[0]);
    expect(at(3).image).toBe(p.clue.normal[0]);
    expect(at(99).image).toBe(p.clue.normal[0]);
    expect(at(99, true).image).toBe(p.clue.hard[5]);
    expect(at(0).silhouette).toBe(true);
    expect(at(2, false, true).image).toBe(p.clue.reveal);
    // The coloured portrait never reaches the browser before the end.
    for (let w = 0; w < 8; w++) expect(at(w).image).not.toBe(p.clue.reveal);
    expect(checkLeaks(p)).toEqual([]);
  });

  it("The Arsenal shows the weapon in colour after 4 wrong guesses (never in hard mode)", async () => {
    const images = { crops: async (_u: string, s: unknown[]) => s.map((_, i) => `/media/${String(i).padStart(40, "1")}`), copy: async () => `/media/${"e".repeat(40)}` };
    const p = await arsenal.build({ answerId: "2", ref: 2 }, ctx(data, "s", { images }));
    expect((arsenal.clue(p, 4, false) as { image: string }).image).toBe(p.clue.reveal);
    expect((arsenal.clue(p, 9, false, { hard: true }) as { image: string }).image).not.toBe(p.clue.reveal);
  });
});

// ───────────── The Calculus ─────────────

describe("The Calculus", () => {
  const stats = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `Stat ${i}`, value: i + 1, display: `${i + 1}s` }));
  const four = (heroId: number, base: number, n = CALCULUS_MIN_STATS + 1) =>
    [1, 2, 3, 4].map((slot) => { const a = ability(base + slot, heroId, slot, `Ability ${base + slot}`); a.src.stats = stats(n); return a; });
  const thin = four(2, 20, CALCULUS_MIN_STATS - 1);
  const data = makeData({ heroes: [hero(1, "Haze"), hero(2, "Seven"), hero(3, "Paige")], abilities: [...four(1, 10), ...thin, ...four(3, 30).slice(0, 3)] });

  it("heroes need all four abilities, each with enough stats", () => {
    expect(calculus.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([1]);
  });

  it("shows all four abilities with every stat; hard mode omits one stat of each until finished", async () => {
    const p = await calculus.build({ answerId: "1", ref: 1 }, ctx(data));
    type C = { abilities: { slot: string; stats: { display: string | null }[] }[] };
    const c = (hard: boolean, done = false) => calculus.clue(p, 0, done, { hard }) as C;
    expect(c(false).abilities.map((a) => a.slot)).toEqual(["Ability 1", "Ability 2", "Ability 3", "Ultimate"]);
    expect(c(false).abilities.every((a) => a.stats.every((s) => s.display))).toBe(true);
    expect(c(true).abilities.every((a) => a.stats.filter((s) => s.display === null).length === 1)).toBe(true);
    expect(c(true, true).abilities.every((a) => a.stats.every((s) => s.display))).toBe(true);
    expect(p.answer.name).toBe("Haze");
    expect(checkLeaks(p)).toEqual([]);
  });

  it("normalizes tooltip properties plus the base stats, labelled and non-zero only, one per label", () => {
    const s = abilityStats({
      tooltip_details: { info_sections: [{ basic_properties: ["MaxLifetime"], properties_block: [{ properties: [{ important_property: "DPS" }, { important_property: "Zero" }] }] }] },
      properties: {
        MaxLifetime: { label: "Lifetime", value: "5", postfix: "s" }, DPS: { label: "Damage Per Second", value: 75 }, Zero: { label: "Nothing", value: "0" },
        AbilityCooldown: { label: "Cooldown", value: 26, postfix: "s" }, AbilityCastRange: { label: "Cast Range", value: "0", postfix: "m" },
        AbilityCharges: { label: "Charges", value: "1" }, AbilityDuration: { label: "Lifetime", value: "3" },
      },
    });
    expect(s.map((x) => `${x.label}=${x.display}`)).toEqual(["Lifetime=5s", "Damage Per Second=75", "Cooldown=26s", "Charges=1"]);
  });
});

// ───────────── The Decoy ─────────────

const item = (id: number, name: string, slot = "weapon"): ItemData =>
  ({ id, name, aliases: [], exclude: [], attrs: {}, src: { className: `c${id}`, slot, statBonuses: [], componentClassNames: [] }, image: `/media/${String(id).padStart(40, "0")}`, glyph: null }) as unknown as ItemData;

describe("The Decoy", () => {
  // Hero 1 buys items 1-8 a lot (core), item 9 never although others do (the fake), item 10 is rare everywhere.
  const items = Array.from({ length: 10 }, (_, i) => item(i + 1, `Item ${i + 1}`));
  const stats = {
    heroMatches: new Map([[1, 1000], [2, 1000], [3, 1000]]),
    itemMatches: new Map([
      [1, new Map([...items.slice(0, 8).map((it) => [it.id, 300 + it.id * 20] as [number, number]), [9, 2], [10, 0]])],
      [2, new Map([...items.slice(0, 8).map((it) => [it.id, 40] as [number, number]), [9, 400], [10, 5]])],
      [3, new Map([...items.slice(0, 8).map((it) => [it.id, 40] as [number, number]), [9, 300], [10, 5]])],
    ]),
  };
  const data = makeData({ heroes: [hero(1, "Haze"), hero(2, "Seven"), hero(3, "Vyper")], items });

  it("fakes are almost never bought by this hero but common elsewhere", () => {
    expect(fakeCandidates(1, data, stats, new Set()).map((i) => i.id)).toEqual([9]);
  });

  it("builds 7 real items and the fake, judges picks and scores 100/50/25", async () => {
    const p = await decoy.build({ answerId: "1", ref: 1 }, ctx(data, "s", { analytics: async () => stats }));
    expect(p.clue.items).toHaveLength(8);
    expect(p.correctIds).toEqual(["9"]);
    const lock = LOCK_BY_SLUG.decoy;
    const real = p.clue.items.filter((i) => i.id !== "9").map((i) => i.id);
    const v = (g: string[], hard = false) => evaluate(lock, row(p, "decoy"), 1, g, undefined, () => undefined, { hard });
    expect(v(["9"]).souls).toBe(100);
    expect(v([real[0], "9"]).souls).toBe(50);
    expect(v([real[0], real[1], "9"]).souls).toBe(25);
    expect(v([real[0], real[1], real[2]]).status).toBe("lost");
    expect(v(["404"]).notice).toBeTruthy();
    // Hard mode hides the hero (until finished) and is worth 1.5x.
    expect((v([], true).clue as { hero: unknown }).hero).toBeNull();
    expect(v(["9"], true).souls).toBe(150);
  });
});

// ───────────── The Cache ─────────────

const raw = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, "fixtures/omens-108658648.json.gz"))).toString());
const tl = buildTimeline(raw.metadata, raw.replay);

describe("The Cache", () => {
  const ids = [...new Set(tl.players.flatMap((p) => p.items.map((i) => i.id)))];
  const data = makeData({
    heroes: tl.players.map((p) => hero(p.heroId, `Hero ${p.heroId}`, { icon: `/media/${String(p.heroId).padStart(40, "0")}` })),
    items: ids.map((id, i) => item(id, `Item ${i}`, ["weapon", "vitality", "spirit"][i % 3])),
  });

  it("reads final inventories (kept items only) and accepts complete teams", () => {
    const inv = finalInventory(tl.players[0], data, tl.duration);
    expect(inv.length).toBeGreaterThan(0);
    expect(new Set(inv.map((i) => i.name)).size).toBe(inv.length);
    expect(teamProblem(tl, "amber", data)).toBeNull();
    expect(teamProblem({ ...tl, duration: 600 }, "amber", data)).toBe("match too short");
  });

  it("freezes a team, locks matched inventories and scores by submissions", async () => {
    const p = await cache.build({ answerId: "match", ref: 0 }, ctx(data, "x", { matches: async () => [tl] }));
    expect(p.key).toMatch(/^\d+:(amber|sapphire)$/);
    const answer = p.correctIds[0].split(",");
    const lock = LOCK_BY_SLUG.cache;
    const wrong = [answer[1], answer[0], ...answer.slice(2)].join(",");
    const v = (g: string[], hard = false) => evaluate(lock, row(p, "cache"), 1, g, undefined, () => undefined, { hard });
    const one = v([wrong]);
    expect(one.status).toBe("playing");
    expect((one.clue as { locked: (string | null)[] }).locked.slice(2)).toEqual(answer.slice(2));
    expect(v([wrong, answer.join(",")]).souls).toBe(75);
    // Moving an already matched inventory is refused (costs nothing).
    const moved = [answer[2], answer[1], answer[0], ...answer.slice(3)].join(",");
    expect(v([wrong, moved]).notice).toBeTruthy();
    expect(v(["1,2,3"]).notice).toBeTruthy();
    // Hard mode blanks items and net worth until finished.
    const hard = v([], true).clue as { inventories: { items: unknown[]; souls: number | null }[] };
    expect(hard.inventories.every((i) => i.souls === null)).toBe(true);
    expect(hard.inventories.some((i) => i.items.includes(null))).toBe(true);
  });

  it("seals when nothing is harvested", async () => {
    await expect(cache.build({ answerId: "match", ref: 0 }, ctx(data))).rejects.toThrow(/harvested/);
  });
});

// ───────────── The Constellation ─────────────

describe("The Constellation", () => {
  const f = (dim: string, members: number[]): Facet => ({ dim, label: dim, info: "", members: new Set(members) });

  it("solves grids with distinct heroes", () => {
    expect(solveGrid([[1, 2], [1], [2, 3]])).toEqual([2, 1, 3]);
    expect(solveGrid([[1], [1]])).toBeNull();
  });

  it("drops facets that repeat the same heroes, picks fair grids or none", () => {
    expect(dedupeFacets([f("a", [1, 2]), f("b", [2, 1]), f("c", [3])]).map((x) => x.dim)).toEqual(["a", "c"]);
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    const facets = Array.from({ length: 8 }, (_, k) => f(`d${k}`, all.filter((h) => (h + k) % 2 === 0 || h % 3 === k % 3)));
    const grid = pickGrid(facets, makeRng("g"));
    expect(grid).not.toBeNull();
    expect(grid!.valid.every((v) => v.length >= 2)).toBe(true);
    expect(new Set(grid!.solution).size).toBe(9);
    expect(pickGrid([f("a", [1]), f("b", [2]), f("c", [3]), f("d", [4]), f("e", [5]), f("f", [6])], makeRng("g"), 50)).toBeNull();
  });

  it("judges typed names: unknown and duplicate names cost nothing, a wrong hero costs a life, partial credit", async () => {
    const heroes = Array.from({ length: 24 }, (_, i) => hero(i + 1, `Hero${String.fromCharCode(65 + i)}`, { aliases: i === 0 ? ["Alpha"] : [] }));
    const data = makeData({ heroes });
    // Six dimensions; members chosen so every cell has several heroes.
    const groups = Array.from({ length: 6 }, (_, k) => ({ key: `g${k}`, label: `Group ${k}`, info: "", members: heroes.filter((h) => (h.id * (k + 3) + k) % 7 < 4).map((h) => h.id) }));
    const p = await constellation.build({ answerId: "grid", ref: 0 }, ctx(data, "c", { heroCategories: async () => groups }));
    const lock = LOCK_BY_SLUG.constellation;
    const valid = p.clue.valid;
    const name = (id: number) => heroes.find((h) => h.id === id)!.name;
    const v = (g: string[]) => evaluate(lock, row(p, "constellation"), 1, g, undefined, () => undefined);
    const first = `0:${name(valid[0][0]).toLowerCase()}`;
    expect(v([first]).rows[0].correct).toBe(true);
    expect(v([first, "1:Nobody"]).notice).toMatch(/No hero/);
    expect(v([first, `1:${name(valid[0][0])}`]).notice).toMatch(/already on the board/);
    const outsider = heroes.find((h) => !valid[1].includes(h.id) && h.id !== valid[0][0])!;
    const w = v([first, `1:${outsider.name}`]);
    expect(w.wrong).toBe(1);
    expect(v([first, `1:${outsider.name}`, `1:${outsider.name.toUpperCase()}`]).notice).toMatch(/already tried/);
    // A full solution wins with 100 souls.
    const full = p.clue.solution.map((id, i) => `${i}:${name(id)}`);
    const won = v(full);
    expect(won.status).toBe("won");
    expect(won.souls).toBe(100);
    expect(normalizeName("Mo & Krill")).toBe("mokrill");
  });
});

// ───────────── hard mode ─────────────

describe("hard mode", () => {
  it("hides two grid columns per puzzle (fixed), none on small grids", () => {
    expect(hardHiddenColumns(3, "5")).toEqual([]);
    const h = hardHiddenColumns(9, "17");
    expect(h).toHaveLength(2);
    expect(h[0]).not.toBe(h[1]);
    expect(hardHiddenColumns(9, "17")).toEqual(h);
  });

  it("The Reckoning: hidden tiles show '?' and the win is worth 1.5x", async () => {
    const data = makeData({ heroes: Array.from({ length: 6 }, (_, i) => hero(i + 1, `H${i + 1}`)) });
    const p = (await reckoning.build({ answerId: "1", ref: 1 }, ctx(data))) as BasePayload;
    const lock = LOCK_BY_SLUG.reckoning;
    const view = evaluate(lock, row(p, "classic"), 1, ["2", "1"], undefined, heroLookup(data), { hard: true });
    expect(view.rows[0].tiles!.filter((t) => t.result === "hidden")).toHaveLength(2);
    expect(view.souls).toBe(hardSouls(90));
    expect(evaluate(lock, row(p, "classic"), 1, ["2", "1"], undefined, heroLookup(data)).souls).toBe(90);
  });

  it("is ignored on locks without a hard variant", async () => {
    const view = evaluate(LOCK_BY_SLUG.testament, row({ v: 1, mode: "lore", answer: { id: "1", name: "Haze", image: null }, correctIds: ["1"], leakTerms: [], hints: {}, clue: { chunks: ["a"] } }, "lore"), 1, ["1"], undefined, () => ({ id: "1", name: "Haze", icon: null }), { hard: true });
    expect(view.hard).toBeUndefined();
    expect(view.souls).toBe(100);
  });
});

