import { describe, expect, it } from "vitest";
import { buffLabels } from "@/lib/engine/columns";
import type { ItemData } from "@/lib/engine/context";

const item = (...labels: string[]) => ({ src: { statBonuses: labels.map((label) => ({ label })) } }) as unknown as ItemData;

describe("buffLabels", () => {
  // A regex typo (/s+/ for /\s+/) once stripped every lowercase "s" and froze the damage into puzzles.
  it("keeps labels intact", () => {
    expect(buffLabels(item("Bonus Health", "Bullet Resist", "Spirit Resist On Spirit Damage"))).toEqual(["Bonus Health", "Bullet Resist", "Spirit Resist On Spirit Damage"]);
  });
  it("splits on , and / and collapses whitespace", () => {
    expect(buffLabels(item("Move  Speed", "Fire Rate/Max Ammo"))).toEqual(["Move Speed", "Fire Rate Max Ammo"]);
  });
});
