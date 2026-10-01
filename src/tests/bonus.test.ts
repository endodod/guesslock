import { describe, expect, it } from "vitest";
import { costBonus, slotBonus, ultimateBonus, withBonus } from "@/lib/engine/bonus";
import { visage } from "@/lib/engine/modes/hero";
import { evaluate } from "@/lib/engine/play";
import { makeRng } from "@/lib/rng";
import { LOCK_BY_SLUG } from "@/locks.config";
import type { ItemData } from "@/lib/engine/context";
import { ability, hero, makeData, noAnalytics } from "./fixtures";

const haze = hero(13, "Haze");
const abilities = [ability(1, 13, 1, "Sleep Dagger"), ability(2, 13, 2, "Smoke Bomb"), ability(3, 13, 3, "Fixation"), ability(4, 13, 4, "Bullet Dance")];
const item = (id: number, name: string, cost: number | null): ItemData =>
  ({ id, name, aliases: [], exclude: [], src: { className: name, slot: "weapon", tier: 1, cost, statBonuses: [] }, attrs: {}, image: null, glyph: null }) as unknown as ItemData;
const data = makeData({ heroes: [haze, hero(2, "Seven")], abilities, items: [item(1, "A", 500), item(2, "B", 1250), item(3, "C", 3000), item(4, "D", 6200), item(5, "E", null)] });
const rng = () => makeRng("x");
const ctx = { data, rng: makeRng("s"), date: "2026-10-01", dayIndex: 0, analytics: noAnalytics };

describe("Bonus questions", () => {
  it("heroes: which of their abilities is the ultimate", () => {
    const b = ultimateBonus(data, 13, rng())!;
    expect(b.options.map((o) => o.name).sort()).toEqual(["Bullet Dance", "Fixation", "Sleep Dagger", "Smoke Bomb"]);
    expect(b.options.find((o) => o.id === b.answerId)!.name).toBe("Bullet Dance");
    expect(ultimateBonus(data, 2, rng())).toBeUndefined(); // no abilities known
  });

  it("abilities: which slot; items: the real cost among three others, in ascending order", () => {
    expect(slotBonus(data, 4)).toMatchObject({ answerId: "4" });
    const b = costBonus(data, 2, rng())!;
    expect(b.options.map((o) => o.id)).toEqual(["500", "1250", "3000", "6200"].filter((c) => b.options.some((o) => o.id === c)));
    expect(b.options).toHaveLength(4);
    expect(b.answerId).toBe("1250");
    expect(costBonus(data, 5, rng())).toBeUndefined(); // no cost
  });

  it("withBonus adds the question to a mode without one, deterministically", async () => {
    const mode = withBonus(visage);
    const a = await mode.build({ answerId: "13", ref: 13 }, ctx);
    const b = await mode.build({ answerId: "13", ref: 13 }, ctx);
    expect(a.bonus).toBeDefined();
    expect(a.bonus).toEqual(b.bonus);
  });

  it("a bonus whose answer was already on screen is not asked", async () => {
    const p = await withBonus(visage).build({ answerId: "13", ref: 13 }, ctx);
    const lock = LOCK_BY_SLUG.visage;
    const row = { date: "2026-10-01", mode: "visage", sealed: false, sealedReason: null, payload: p };
    const lookup = (id: string) => ({ id, name: id === "13" ? "Haze" : "Seven", icon: null });
    expect(evaluate(lock, row, 1, ["13"], undefined, lookup).bonus?.options).toHaveLength(4);
    // Same puzzle, but the ultimate's name shows up in a guessed hero's row (e.g. an ability-named entry).
    const echoed = { ...row, payload: { ...p, bonus: { ...p.bonus!, options: p.bonus!.options.map((o) => (o.id === p.bonus!.answerId ? { ...o, name: "Haze" } : o)) } } };
    expect(evaluate(lock, echoed, 1, ["13"], undefined, lookup).bonus).toBeUndefined();
  });
});
