import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildTimeline, toMap } from "@/lib/omens/ingest";
import {
  buildAnswer, buildSnapshot, buildWindow, detect, mixPool, snapshotLeaks, type Candidate,
} from "@/lib/omens/scenario";
import { omenSymbol, omenTicks, pickPoints, scoreBeast, scoreClash, scoreRift, stepperPoints } from "@/lib/omens/scoring";
import type { BeastAnswer, ClashAnswer, RiftAnswer } from "@/lib/omens/types";

// Real high-rank match 108658648 (metadata + replay query rows), account/Steam IDs replaced by fakes.
const raw = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, "fixtures/omens-108658648.json.gz"))).toString());
const tl = buildTimeline(raw.metadata, raw.replay);
const slot = (s: number) => tl.players.find((p) => p.slot === s)!;
const owned = (s: number, t: number) => slot(s).items.filter((i) => i.t <= t && (i.sold === 0 || i.sold > t)).map((i) => i.id).sort();

describe("Omens: timeline from a real match", () => {
  it("maps lobby team 0 to Amber and joins replay rows by Steam ID", () => {
    expect(tl.players.filter((p) => p.team === "amber").map((p) => p.slot)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tl.players.every((p) => p.maxHp[600] > 0 && p.netWorth[600] > 0)).toBe(true);
  });

  it("reconstructs inventories at T (hand-checked)", () => {
    // Slot 1 at 15:00: Extra Regen sold at 772, Spirit Strike upgraded into Spirit Snatch at 573.
    expect(owned(1, 900)).toEqual([26002154, 754480263, 968099481, 1342610602, 1437614329, 2163598980, 2566692615, 3190916303].sort());
    // Slot 7 at 11:40: Opening Rounds, Improved Spirit, Rapid Recharge, Healing Booster, Enduring Speed.
    expect(owned(7, 700)).toEqual([2064029594, 7409189, 787198704, 2566692615, 2447176615].sort());
    // Slot 7 at 5:13: High-Velocity Rounds becomes Opening Rounds in the same second.
    expect(owned(7, 313)).toEqual([3776945997, 2829638276, 2064029594].sort());
  });

  it("finds the midboss kill, its spawns and every rift", () => {
    expect(tl.midboss.kills).toEqual([{ t: 1249, killedBy: "amber", claimedBy: "amber" }]);
    expect(tl.midboss.alive.map((a) => a.spawnAt)).toEqual([0, 1734]);
    expect(tl.rifts.map((r) => [r.openAt, r.endAt, r.claimedBy])).toEqual([[685, 703, "amber"], [1135, 1166, "amber"], [1522, 1528, "sapphire"]]);
    // Rift spots sit on the east and west of the map.
    expect(Math.abs(tl.rifts[0].pos!.x)).toBeGreaterThan(5000);
  });

  it("calibrates world coordinates to the minimap (neutral camp chinatown_bell_1)", () => {
    const [left, top] = toMap(3248, -1888);
    expect(left).toBeCloseTo(0.6510416, 3);
    expect(top).toBeCloseTo(0.5877976, 3);
  });
});

describe("Omens: scenarios", () => {
  const clash = detect("clash", tl, "s");
  const beast = detect("beast", tl, "s");
  const rift = detect("rift", tl, "s");

  it("detects positive and negative moments, reproducibly", () => {
    expect(clash.some((c) => c.positive) && clash.some((c) => !c.positive)).toBe(true);
    expect(clash.every((c) => c.window === 20)).toBe(true);
    // The Beast only ever picks moments where the midboss falls.
    expect(beast).toHaveLength(1);
    expect(beast.every((c) => c.positive)).toBe(true);
    expect(rift).toHaveLength(3);
    expect(detect("clash", tl, "s")).toEqual(clash);
  });

  it("derives answers from the window", () => {
    const b = beast.find((c) => c.positive)!;
    expect(b.t).toBeGreaterThanOrEqual(1249 - 50);
    expect(b.t).toBeLessThanOrEqual(1249 - 30);
    expect(buildAnswer(tl, b)).toEqual({ killed: true, killer: "amber", claimer: "amber", rejuvs: { amber: 1, sapphire: 0 } });
    expect((buildAnswer(tl, rift[2]) as RiftAnswer).claimer).toBe("sapphire");

    for (const c of clash) {
      const a = buildAnswer(tl, c) as ClashAnswer;
      expect(a.anyDeath).toBe(c.positive);
      expect(a.deaths.amber + a.deaths.sapphire >= a.died.length).toBe(true);
      const w = buildWindow(tl, c);
      expect(w.events.filter((e) => e.type === "death")).toHaveLength(a.deaths.amber + a.deaths.sapphire);
    }
  });

  it("never leaks names, IDs or the future into the snapshot", () => {
    for (const c of [...clash, ...beast, ...rift]) {
      const s = buildSnapshot(tl, c);
      expect(snapshotLeaks(s, tl)).toEqual([]);
      expect(JSON.stringify(s)).not.toMatch(/"(events|tracks|answer|died|claimedBy|killedBy)"/);
      // Items are only those owned at T.
      for (const h of s.heroes) expect([...h.items].sort()).toEqual(owned(tl.players[h.key].slot, c.t));
    }
    const c = rift[0];
    expect(buildSnapshot(tl, c).rift).toEqual({ opensIn: tl.rifts[0].openAt - c.t, pos: toMap(tl.rifts[0].pos!.x, tl.rifts[0].pos!.y) });
  });

  it("keeps the positive/negative mix within ±10% over 200 scenarios", () => {
    const fake = (positive: boolean, i: number): Candidate => ({ omen: "clash", t: i, window: 30, positive, quality: 0.5 + (i % 7) / 20, focus: { x: 0, y: 0 } });
    const pool = [...Array.from({ length: 300 }, (_, i) => fake(true, i)), ...Array.from({ length: 300 }, (_, i) => fake(false, i))];
    const picked = mixPool(pool, 200, "ratio");
    const share = picked.filter((c) => c.positive).length / picked.length;
    expect(picked).toHaveLength(200);
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
  });
});

describe("Omens: scoring", () => {
  const clash = (anyDeath: boolean, amber: number, sapphire: number, died: number[]): ClashAnswer => ({ anyDeath, deaths: { amber, sapphire }, died });

  it("Clash: perfect, no deaths, nothing picked, all wrong", () => {
    const actual = clash(true, 1, 1, [2, 8]);
    expect(scoreClash(actual, actual).total).toBe(100);
    expect(scoreClash(clash(false, 0, 0, []), clash(false, 0, 0, [])).total).toBe(100);
    // Nothing picked while two died: 20 + 7 + 7 + 0.
    expect(scoreClash(clash(true, 0, 0, []), actual).total).toBe(34);
    // All wrong: every question 0 (steppers off by more than one, picks all wrong).
    expect(scoreClash(clash(false, 4, 4, [0, 1, 3]), actual).total).toBe(0);
  });

  it("Clash: who dies is +50/n per hit, -50/n per miss, floor 0", () => {
    expect(pickPoints([2], [2, 8])).toBe(25);
    expect(pickPoints([2, 3], [2, 8])).toBe(0);
    expect(pickPoints([3], [])).toBe(0);
    expect(pickPoints([], [])).toBe(50);
    expect(stepperPoints(0, 0, 15)).toBe(15);
    expect(stepperPoints(2, 1, 15)).toBe(7);
  });

  it("Beast: who kills it, and how many rejuvs each team has", () => {
    const a: BeastAnswer = { killed: true, killer: "amber", claimer: "sapphire", rejuvs: { amber: 1, sapphire: 1 } };
    expect(scoreBeast(a, a).total).toBe(100);
    // Right killer, both counts off by one: 40 + 15 + 15.
    expect(scoreBeast({ ...a, rejuvs: { amber: 2, sapphire: 0 } }, a).total).toBe(70);
    expect(scoreBeast({ ...a, killer: "sapphire", rejuvs: { amber: 4, sapphire: 4 } }, a).total).toBe(0);
  });

  it("Rift: claimer and deaths", () => {
    const a: RiftAnswer = { claimer: "none", deaths: { amber: 0, sapphire: 0 } };
    expect(scoreRift(a, a).total).toBe(100);
    expect(scoreRift({ claimer: "amber", deaths: { amber: 1, sapphire: 3 } }, a).total).toBe(12);
  });

  it("share symbols and ticks", () => {
    expect([omenSymbol(80), omenSymbol(40), omenSymbol(39)]).toEqual(["✨", "🔓", "🔒"]);
    const r = scoreClash(clash(true, 1, 0, [2]), clash(true, 1, 1, [2, 8]));
    expect(omenTicks(r)).toBe("✓✓✗✗");
  });
});
