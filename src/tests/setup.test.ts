import { describe, expect, it } from "vitest";
import { distinctiveItems } from "@/lib/engine/modes/hero";
import { parseSetup } from "@/lib/admin/setup";
import type { ItemData } from "@/lib/engine/context";

const item = (id: number, cls: string): ItemData =>
  ({ id, name: cls, aliases: [], exclude: [], src: { className: cls, slot: "weapon" }, image: null, glyph: null }) as unknown as ItemData;

// Hero 1 buys items 1..10 in 50% of matches (more of the later ones); hero 2 in 5%.
const items = Array.from({ length: 10 }, (_, i) => item(i + 1, `i${i + 1}`));
const stats = {
  heroMatches: new Map([[1, 1000], [2, 1000]]),
  itemMatches: new Map([
    [1, new Map(items.map((it) => [it.id, 400 + it.id * 10]))],
    [2, new Map(items.map((it) => [it.id, 50]))],
  ]),
};

describe("Puzzle setup", () => {
  it("parses only known, well-formed fields", () => {
    expect(parseSetup(null)).toEqual({});
    expect(parseSetup({ splash: " https://x/a.png ", buildPin: ["a", 3, ""], buildBan: "nope", junk: 1 }))
      .toEqual({ splash: "https://x/a.png", buildPin: ["a"] });
  });

  it("Belongings: no overrides keeps the top 8 by lift, least telling first", () => {
    const out = distinctiveItems(1, { items }, stats).map((i) => i.name);
    expect(out).toHaveLength(8);
    expect(out.at(-1)).toBe("i10");
    expect(out).not.toContain("i1");
  });

  it("Belongings: banned items never show, pinned ones always show last", () => {
    const out = distinctiveItems(1, { items }, stats, { buildPin: ["i1"], buildBan: ["i10"] }).map((i) => i.name);
    expect(out).toHaveLength(8);
    expect(out).not.toContain("i10");
    expect(out.at(-1)).toBe("i1");
  });

  it("Belongings: 5+ pinned items cover a hero without match data", () => {
    const pins = ["i1", "i2", "i3", "i4", "i5"];
    expect(distinctiveItems(3, { items }, stats, { buildPin: pins }).map((i) => i.name)).toEqual([...pins].reverse());
    expect(distinctiveItems(3, { items }, stats, { buildPin: pins.slice(0, 2) })).toEqual([]);
  });
});
