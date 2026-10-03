import { describe, expect, it } from "vitest";
import { DEFAULT_WEAPON_GROUPS, buffLabels, parseWeaponGroups, weaponFamily, weaponInfo } from "@/lib/engine/columns";
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

describe("weapon groups", () => {
  it("folds weapon types into families, case-insensitively", () => {
    expect(weaponFamily("Shotgun")).toBe("Spread");
    expect(weaponFamily(" Burst Fire ")).toBe("Rapid fire");
    expect(weaponFamily(null)).toBeNull();
  });
  it("uses an admin table and lets unknown types stand for themselves", () => {
    const groups = { shotgun: "Close range", spreadshot: "Close range" };
    expect(weaponFamily("Shotgun", groups)).toBe("Close range");
    expect(weaponFamily("Rat Cannon", groups)).toBe("Rat Cannon");
  });
  it("cleans a stored table and falls back to the default when it is unusable", () => {
    expect(parseWeaponGroups({ " Shotgun ": " Spread ", bow: "", x: 3 })).toEqual({ shotgun: "Spread" });
    expect(parseWeaponGroups(null)).toBe(DEFAULT_WEAPON_GROUPS);
    expect(parseWeaponGroups(["shotgun"])).toBe(DEFAULT_WEAPON_GROUPS);
  });
  it("writes the player explanation from the table", () => {
    expect(weaponInfo({ pistol: "Pistol", shotgun: "Spread", spreadshot: "Spread" })).toBe("Weapon family: Pistol or Spread (shotgun, spreadshot).");
  });
});
