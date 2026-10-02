import { describe, expect, it } from "vitest";
import {
  CASES, COSMETICS, KIND_ORDER, MAP_OBJECTS, RARITY_ORDER, SET_CATEGORIES, buildCollectibles, buildSets, casePool, casePreview, caseOdds, collectorsCrate, crateId, crateRarity, CRATE_MARKUP, expectedValue,
  rollCase, sellPrice, sellRate, sparesPrice, SELL_RATE, SPARE_RATES, type Collectible, type Kind, type Rarity,
} from "@/lib/market/catalog";
import { makeRng } from "@/lib/rng";
import { DAILY_INCOME, scaleValue } from "@/lib/game/economy";
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
    expect(items.find((c) => c.key === "item:10")).toMatchObject({ rarity: "common", value: scaleValue(50) });
    expect(items.find((c) => c.key === "item:40")).toMatchObject({ rarity: "legendary", value: scaleValue(630) });
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

  it("caseOdds is the exact distribution rollCase draws from", () => {
    for (const c of CASES) {
      const odds = caseOdds(c, all);
      expect([...odds.values()].reduce((a, p) => a + p, 0), c.id).toBeCloseTo(1);
      const rng = makeRng(`odds:${c.id}`);
      const n = 30000;
      const seen = new Map<string, number>();
      for (let i = 0; i < n; i++) { const k = rollCase(c, all, rng.next(), rng.next(), rng.next()).key; seen.set(k, (seen.get(k) ?? 0) + 1); }
      // Per rarity (single items are too rare to check at this sample size).
      for (const r of RARITY_ORDER) {
        const p = [...odds].filter(([k]) => all.find((x) => x.key === k)!.rarity === r).reduce((a, [, q]) => a + q, 0);
        const got = [...seen].filter(([k]) => all.find((x) => x.key === k)!.rarity === r).reduce((a, [, q]) => a + q, 0) / n;
        expect(Math.abs(p - got), `${c.id} ${r}`).toBeLessThan(0.015);
      }
    }
  });
});

describe("The Black Market selling", () => {
  const x = { value: 400 } as Pick<Collectible, "value">;

  it("a spare copy sells for more than the last copy, rising with the stack, and the last copy keeps the base rate", () => {
    expect(sellPrice(x, 1)).toBe(Math.round(400 * SELL_RATE));
    expect(sellPrice(x, 2)).toBe(300);
    expect(sellPrice(x, 3)).toBe(340);
    expect(sellPrice(x, 4)).toBe(380);
    expect(sellPrice(x, 9)).toBe(380); // from the third spare on, the rate stays
    for (let n = 2; n < 8; n++) expect(sellPrice(x, n)).toBeGreaterThan(sellPrice(x, 1));
    for (let n = 2; n < 8; n++) expect(sellRate(n)).toBeGreaterThanOrEqual(sellRate(n - 1));
    // Selling every spare of a stack of three: the second spare (85%) then the first (75%); the last copy stays.
    expect(sparesPrice(x, 3)).toBe(340 + 300);
    expect(sparesPrice(x, 1)).toBe(0);
  });

  it("even the best spare rate stays below what a case pays back on average, so reselling doubles can never make cases free money", () => {
    const best = Math.max(...SPARE_RATES);
    expect(best).toBeLessThan(1);
    for (const c of CASES) expect(expectedValue(c, all) * best, c.id).toBeLessThan(c.price);
  });
});

describe("The Black Market economy", () => {
  it("a Cursed Vault costs about a full day of a typical player, the others a share of it, and every case still pays back 60-90%", () => {
    const cursed = CASES.find((c) => c.id === "cursed")!;
    expect(Math.abs(cursed.price - DAILY_INCOME)).toBeLessThanOrEqual(10);
    expect(DAILY_INCOME).toBeGreaterThan(1200);
    expect(DAILY_INCOME).toBeLessThan(3000);
    for (const c of CASES) {
      expect(c.price, c.id).toBeLessThanOrEqual(cursed.price);
      const ratio = expectedValue(c, all) / c.price;
      expect(ratio, c.id).toBeGreaterThan(0.1); // the fixture catalogue is smaller than the real one
      expect(ratio, c.id).toBeLessThan(1.05);
    }
    // The cheapest case is a small fraction of a day, so a day buys several.
    expect(Math.min(...CASES.map((c) => c.price))).toBeLessThan(DAILY_INCOME / 4);
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

describe("Collector's Crates", () => {
  const none = new Set<string>();
  const tier = (r: Rarity) => all.filter((x) => x.rarity === r);

  it("one per rarity, priced at the markup over the average value of what is missing, never below the dearest item", () => {
    for (const r of RARITY_ORDER) {
      const c = collectorsCrate(r, all, none);
      expect(c.id).toBe(crateId(r));
      expect(crateRarity(c.id)).toBe(r);
      expect(c.missing).toBe(tier(r).length);
      expect(c.pool.every((x) => x.rarity === r)).toBe(true);
      const avg = tier(r).reduce((a, x) => a + x.value, 0) / tier(r).length;
      expect(c.price).toBeGreaterThanOrEqual(avg * CRATE_MARKUP);
      expect(c.price).toBeGreaterThanOrEqual(Math.max(...tier(r).map((x) => x.value)));
      // Early in a collection a crate costs more per new item than the cheapest case.
      expect(c.price).toBeGreaterThan(Math.min(...CASES.map((k) => k.price)));
    }
    expect(crateRarity("missing:mythic")).toBeNull();
  });

  it("never offers an owned item, is unavailable (price 0) when the tier is complete and gets dearer as the cheap items are collected", () => {
    for (const r of RARITY_ORDER) {
      const ascending = [...tier(r)].sort((a, b) => a.value - b.value || (a.key < b.key ? -1 : 1));
      const owned = new Set<string>();
      let last = collectorsCrate(r, all, owned).price;
      for (const it of ascending.slice(0, -1)) {
        owned.add(it.key);
        const c = collectorsCrate(r, all, owned);
        expect(c.pool.some((x) => owned.has(x.key))).toBe(false);
        expect(c.missing).toBe(tier(r).length - owned.size);
        expect(c.price, `${r} after ${owned.size}`).toBeGreaterThanOrEqual(last);
        expect(c.price).toBeGreaterThanOrEqual(Math.max(...c.pool.map((x) => x.value)));
        last = c.price;
      }
      owned.add(ascending[ascending.length - 1].key);
      const done = collectorsCrate(r, all, owned);
      expect(done.missing).toBe(0);
      expect(done.price).toBe(0);
    }
  });

  it("an item from a crate is worth at least what it costs to the player in luck: price per new item stays above the item value", () => {
    for (const r of RARITY_ORDER) {
      const c = collectorsCrate(r, all, new Set(tier(r).slice(0, 3).map((x) => x.key)));
      const avg = c.pool.reduce((a, x) => a + x.value, 0) / c.pool.length;
      expect(c.price).toBeGreaterThan(avg);
    }
  });
});
