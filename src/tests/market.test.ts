import { describe, expect, it } from "vitest";
import {
  CASES, COSMETICS, KIND_ORDER, MAP_OBJECTS, RARITY_ORDER, SET_CATEGORIES, buildCollectibles, buildSets, casePool, casePreview, expectedValue, rollCase, scrapValue,
  sellValue, type Collectible, type Kind,
} from "@/lib/market/catalog";
import { makeRng } from "@/lib/rng";
import { VAULT_UNITS } from "@/locks.config";
import { ability, hero, makeData } from "./fixtures";
import type { ItemData } from "@/lib/engine/context";

const shopItem = (id: number, tier: number, cost: number | null, image: string | null = `/media/${id}`): ItemData =>
  ({ id, name: `Item ${id}`, aliases: [], exclude: [], attrs: {}, src: { className: `c${id}`, slot: "weapon", tier, cost, statBonuses: [], componentClassNames: [] }, image, glyph: null }) as unknown as ItemData;

// 4 tiers x 6 items, 40 heroes with a weapon picture (enough that every rarity has weapons whatever the hash says), 4 abilities each.
const heroes = Array.from({ length: 40 }, (_, i) => hero(i + 1, `Hero${i + 1}`, { weapon: `/media/w${i + 1}` }));
const data = makeData({
  heroes,
  abilities: heroes.flatMap((h) => [1, 2, 3, 4].map((slot) => ability(h.id * 10 + slot, h.id, slot, `Ability ${h.id}.${slot}`, { icon: `/media/a${h.id}${slot}` }))),
  items: [
    ...[1, 2, 3, 4].flatMap((t) => Array.from({ length: 6 }, (_, k) => shopItem(t * 10 + k, t, [500, 1250, 3000, 6300][t - 1]))),
    shopItem(900, 1, null), shopItem(901, 2, 800, null),
  ],
});
const all = buildCollectibles(data);

describe("The Black Market catalogue", () => {
  it("builds shop items, hero cards, weapons, abilities, map objects, lock seals and flair, with unique keys", () => {
    expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
    const items = all.filter((c) => c.kind === "item");
    expect(items).toHaveLength(24); // items without a price or a picture are left out
    expect(items.find((c) => c.key === "item:10")).toMatchObject({ rarity: "common", value: 50 });
    expect(items.find((c) => c.key === "item:40")).toMatchObject({ rarity: "legendary", value: 630 });
    expect(all.filter((c) => c.kind === "weapon")).toHaveLength(40);
    expect(all.filter((c) => c.kind === "hero")).toHaveLength(40);
    expect(all.filter((c) => c.kind === "ability")).toHaveLength(160);
    expect(all.filter((c) => c.kind === "seal")).toHaveLength(VAULT_UNITS.length);
    expect(all.filter((c) => c.kind === "map")).toHaveLength(MAP_OBJECTS.length);
    expect(all.filter((c) => c.kind === "flair")).toHaveLength(COSMETICS.length);
    // Ultimates are never common; the first three abilities are never epic or legendary.
    expect(all.filter((c) => c.kind === "ability" && c.tier === 4).every((c) => c.rarity === "epic" || c.rarity === "legendary")).toBe(true);
    expect(all.filter((c) => c.kind === "ability" && c.tier !== 4).every((c) => c.rarity === "common" || c.rarity === "rare")).toBe(true);
    // Value scales with rarity inside every kind that has all four.
    for (const kind of ["item", "weapon", "hero", "map", "flair", "seal"] as Kind[]) {
      const avg = (r: string) => { const xs = all.filter((c) => c.kind === kind && c.rarity === r); return xs.reduce((a, c) => a + c.value, 0) / xs.length; };
      const have = RARITY_ORDER.filter((r) => all.some((c) => c.kind === kind && c.rarity === r));
      for (let i = 1; i < have.length; i++) expect(avg(have[i]), `${kind} ${have[i]}`).toBeGreaterThan(avg(have[i - 1]));
    }
    // A rarity never changes between builds.
    expect(buildCollectibles(data).map((c) => c.rarity)).toEqual(all.map((c) => c.rarity));
  });

  it("odds add up to 1 and every case can drop every rarity", () => {
    for (const c of CASES) {
      expect(RARITY_ORDER.reduce((a, r) => a + c.odds[r], 0)).toBeCloseTo(1);
      for (const r of RARITY_ORDER) expect(casePool(c, all)[r].length, `${c.id} ${r}`).toBeGreaterThan(0);
    }
  });

  it("draws follow the published odds and stay inside the case's kinds", () => {
    const rng = makeRng("market");
    for (const c of CASES) {
      const n = 20000;
      const seen: Record<string, number> = {};
      const kinds = new Set<string>();
      for (let i = 0; i < n; i++) {
        const item = rollCase(c, all, rng.next(), rng.next(), rng.next());
        kinds.add(item.kind);
        seen[item.rarity] = (seen[item.rarity] ?? 0) + 1;
      }
      for (const k of kinds) expect(Object.keys(c.kinds), c.id).toContain(k);
      for (const r of RARITY_ORDER) expect(Math.abs((seen[r] ?? 0) / n - c.odds[r]), `${c.id} ${r}`).toBeLessThan(0.015);
    }
  });

  it("kind weights decide the mix of a case", () => {
    const rng = makeRng("kinds");
    const armory = CASES.find((c) => c.id === "armory")!; // weapon 3 : item 1
    let weapons = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (rollCase(armory, all, 0.5, rng.next(), rng.next()).kind === "weapon") weapons++;
    expect(weapons / n).toBeGreaterThan(0.7);
    expect(weapons / n).toBeLessThan(0.8);
  });

  it("rolls at the edges stay valid", () => {
    for (const c of CASES) {
      expect(rollCase(c, all, 0, 0, 0)).toBeTruthy();
      expect(rollCase(c, all, 0.999999, 0.999999, 0.999999).rarity).toBe("legendary");
    }
  });

  it("a case never pays out more than it costs on average, and never costs far too much", () => {
    for (const c of CASES) {
      const ev = expectedValue(c, all);
      expect(ev, c.id).toBeLessThan(c.price * 1.05);
      expect(ev, c.id).toBeGreaterThan(c.price * 0.15);
    }
  });

  it("every kind is in some case, and a case preview shows every rarity the case holds", () => {
    for (const k of KIND_ORDER) expect(CASES.some((c) => k in c.kinds), k).toBe(true);
    for (const c of CASES) {
      const pre = casePreview(c, all);
      for (const r of RARITY_ORDER) expect(pre.some((x) => x.rarity === r), `${c.id} ${r}`).toBe(true);
      expect(new Set(pre.map((x) => x.key)).size).toBe(pre.length);
    }
  });

  it("scrapping and selling pay a share of the value", () => {
    const x = { value: 400 } as Pick<Collectible, "value">;
    expect(scrapValue(x)).toBe(200);
    expect(sellValue(x)).toBe(240);
    expect(sellValue(x)).toBeGreaterThan(scrapValue(x));
  });
});

describe("The Black Market sets", () => {
  const sets = buildSets(all);
  const by = (id: string) => sets.find((s) => s.id === id)!;
  const worth = (keys: string[]) => keys.reduce((a, k) => a + all.find((c) => c.key === k)!.value, 0);

  it("has unique ids and a category each", () => {
    expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length);
    expect(sets.length).toBeGreaterThan(60);
    for (const s of sets) {
      expect(SET_CATEGORIES).toContain(s.category);
      expect(s.keys.length).toBeGreaterThan(1);
      // Every key is a real collectible, and a set pays less than its items are worth.
      expect(s.reward).toBeLessThan(worth(s.keys));
    }
  });

  it("covers shop slots and tiers, each hero's kit, ultimates, the map, the locks and the grand sets", () => {
    // The tiers of a slot add up to the slot.
    expect(by("slot:weapon").keys).toHaveLength(24);
    expect([1, 2, 3, 4].reduce((a, t) => a + by(`slot:weapon:${t}`).keys.length, 0)).toBe(24);
    // A hero's kit: the card, the weapon and the four abilities.
    expect([...by("kit:1").keys].sort()).toEqual(["ability:11", "ability:12", "ability:13", "ability:14", "hero:1", "weapon:1"]);
    expect(by("ultimates:all").keys).toHaveLength(40);
    expect(by("map:all").keys).toHaveLength(MAP_OBJECTS.length);
    expect(by("map:area:lane").keys.length + by("map:area:jungle").keys.length + by("map:area:prizes").keys.length).toBe(MAP_OBJECTS.length);
    expect(by("seals:all").keys).toHaveLength(VAULT_UNITS.length);
    expect(by("flair:title").keys.every((k) => k.startsWith("title:"))).toBe(true);
    expect(by("grand:vault").keys).toHaveLength(all.length);
    // The grand sets pay the most.
    expect(by("grand:vault").reward).toBeGreaterThan(by("grand:shop").reward);
    expect(by("grand:shop").reward).toBeGreaterThan(by("slot:weapon").reward);
  });
});
