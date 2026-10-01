import { describe, expect, it } from "vitest";
import { costBonus, slotBonus, withBonus } from "@/lib/engine/bonus";
import { visage } from "@/lib/engine/modes/hero";
import { relic } from "@/lib/engine/modes/item";
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
  it("abilities: which slot; items: the real cost among three others, in ascending order", () => {
    expect(slotBonus(data, 4)).toMatchObject({ answerId: "4" });
    expect(slotBonus(data, 4)!.options.map((o) => o.name)).toEqual(["Ability 1", "Ability 2", "Ability 3", "Ultimate"]);
    const b = costBonus(data, 2, rng())!;
    expect(b.options.map((o) => Number(o.id))).toEqual([...b.options.map((o) => Number(o.id))].sort((x, y) => x - y));
    expect(b.options).toHaveLength(4);
    expect(b.answerId).toBe("1250");
    expect(costBonus(data, 5, rng())).toBeUndefined(); // no cost
  });

  it("withBonus only touches the item locks and The Ascension, deterministically", async () => {
    expect(withBonus(visage)).toBe(visage);
    const mode = withBonus(relic);
    const a = await mode.build({ answerId: "2", ref: 2 }, ctx);
    const b = await mode.build({ answerId: "2", ref: 2 }, ctx);
    expect(a.bonus?.answerId).toBe("1250");
    expect(a.bonus).toEqual(b.bonus);
  });

  it("a bonus whose answer was already on screen is not asked", async () => {
    const p = await withBonus(relic).build({ answerId: "2", ref: 2 }, ctx);
    const lock = LOCK_BY_SLUG.relic;
    const row = { date: "2026-10-01", mode: "relic", sealed: false, sealedReason: null, payload: p };
    const lookup = (id: string) => ({ id, name: id === "2" ? "B" : "A", icon: null });
    expect(evaluate(lock, row, 1, ["2"], undefined, lookup).bonus?.options).toHaveLength(4);
    const echoed = { ...row, payload: { ...p, bonus: { ...p.bonus!, options: p.bonus!.options.map((o) => (o.id === p.bonus!.answerId ? { ...o, name: "B" } : o)) } } };
    expect(evaluate(lock, echoed, 1, ["2"], undefined, lookup).bonus).toBeUndefined();
  });

  it("item locks never show or send a tier", async () => {
    const p = await relic.build({ answerId: "2", ref: 2 }, ctx);
    expect(JSON.stringify(p.answer)).not.toMatch(/tier/i);
  });
});
