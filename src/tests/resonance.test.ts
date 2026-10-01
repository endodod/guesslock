import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { resolveHeroFolders, type SoundTree } from "@/lib/sounds/resolve";
import { guessRole, isWeaponFire, matchClip, skipReason } from "@/lib/sounds/match";
import { gainFor, LOUDNESS_TARGET_DB, measurePcm } from "@/lib/sounds/loudness";
import { heroCodenames, planHeroClips, type HeroForSounds } from "@/lib/sounds/import";
import { resonance, soundEligible } from "@/lib/engine/modes/hero";
import { checkLeaks, MEDIA_URL } from "@/lib/engine/leaks";
import { evaluate } from "@/lib/engine/play";
import type { AbilityData, SoundData } from "@/lib/engine/context";
import type { BasePayload } from "@/lib/engine/mode";
import { countedLocks, LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import { shareDay } from "@/lib/game/scoring";
import { dayStreaks, daySouls, ignoredSlugs, isDayUnlocked, streaks } from "@/lib/client/store";
import { makeRng } from "@/lib/rng";
import { hero, makeData, noAnalytics } from "./fixtures";

// Real index snapshot (2026-09-30), pruned: every folder name, full contents for the 5 heroes below.
const fx = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, "fixtures/sounds-index.json.gz"))).toString()) as {
  tree: SoundTree; heroes: HeroForSounds[];
};
const byName = (n: string) => fx.heroes.find((h) => h.name === n)!;

describe("The Resonance: codename -> folders", () => {
  const { heroes, unclaimed } = resolveHeroFolders(fx.heroes, fx.tree);
  const folders = (n: string) => heroes.find((h) => h.heroId === byName(n).id)!;

  it("every active hero gets an ability and a weapon folder", () => {
    expect(fx.heroes).toHaveLength(38);
    for (const h of heroes) {
      expect(h.abilities.length, fx.heroes.find((x) => x.id === h.heroId)!.name).toBeGreaterThan(0);
      expect(h.weapons.length).toBeGreaterThan(0);
    }
  });

  it("handles the known exceptions", () => {
    expect(folders("Abrams").abilities.map((f) => f.folder)).toEqual(["abrams"]); // hero_atlas
    expect(folders("Mo & Krill").abilities.map((f) => f.folder)).toEqual(["mokrill"]); // hero_krill
    expect(folders("Mo & Krill").weapons.map((f) => f.folder)).toEqual(["krill"]);
    expect(folders("Lady Geist").abilities.map((f) => f.folder).sort()).toEqual(["geist", "ghost"]);
    expect(folders("Lady Geist").weapons.map((f) => f.folder)).toEqual(["geist"]);
    expect(folders("Pocket").abilities.map((f) => f.folder).sort()).toEqual(["pocket", "synth"]);
    expect(folders("Sinclair").weapons.map((f) => f.folder)).toEqual(["sinclair"]);
    expect(folders("Calico").abilities.map((f) => f.folder)).toEqual(["nano"]);
    expect(folders("Grey Talon").abilities.map((f) => f.folder)).toEqual(["orion"]);
  });

  it("ignores unreleased/test heroes and shared folders", () => {
    const claimed = heroes.flatMap((h) => [...h.abilities, ...h.weapons].map((f) => f.folder));
    for (const f of ["archer", "architect", "cadence", "fathom", "kali", "operative", "sentry", "tokamak", "trapper", "wrecker", "shared", "digger"])
      expect(claimed).not.toContain(f);
    expect(unclaimed.abilities).toEqual(expect.arrayContaining(["archer", "cadence", "wrecker"]));
    expect(unclaimed.abilities).not.toContain("shared");
  });
});

describe("The Resonance: clip -> ability matching", () => {
  // Hand labels for the 5 heroes: which ability a clip really belongs to (first matching pattern wins).
  const LABELS: Record<string, [RegExp, string][]> = {
    Haze: [[/sleep_dagger|finesse_dagger/, "ability_sleep_dagger"], [/smoke_bomb/, "ability_smoke_bomb"], [/bullet_flurry/, "ability_bullet_flurry"]],
    Abrams: [[/siphonlife/, "citadel_ability_bull_heal"], [/charge/, "citadel_ability_bull_charge"], [/leap|slam/, "citadel_ability_bull_leap"]],
    "Mo & Krill": [[/scorn/, "ability_intimidate"], [/burrow/, "ability_burrow"], [/sandblast/, "ability_throw_sand"], [/combo/, "ability_ult_combo"]],
    Holliday: [[/barrel(?!_launch)|exp_barrels/, "ability_explosive_barrel"], [/bounce_pad|jump_pad/, "ability_bounce_pad"], [/crackshot|target_practice/, "ability_crackshot"], [/lasso/, "ability_gravity_lasso"]],
    "Lady Geist": [[/blood_bomb/, "ability_blood_bomb"], [/life_drain/, "ability_life_drain"], [/malice/, "ability_blood_shards"], [/soul_exchange|blood_exchange/, "ability_health_swap"]],
  };
  const { heroes } = resolveHeroFolders(fx.heroes, fx.tree);

  it("precision on cast clips is at least 0.9 for the 5 hand-labelled heroes", () => {
    let predicted = 0, right = 0;
    for (const [name, labels] of Object.entries(LABELS)) {
      const h = byName(name);
      const f = heroes.find((x) => x.heroId === h.id)!;
      const map = { abilityFolders: f.abilities.map((x) => x.folder), weaponFolders: f.weapons.map((x) => x.folder) };
      for (const c of planHeroClips(fx.tree, h, map)) {
        if (c.kind !== "ability" || c.status !== "suggested" || c.role !== "cast") continue;
        predicted++;
        const truth = labels.find(([re]) => re.test(c.sourcePath))?.[1];
        const got = h.abilities.find((a) => a.id === c.abilityId)?.className;
        if (truth && truth === got) right++;
      }
    }
    expect(predicted).toBeGreaterThan(40);
    expect(right / predicted).toBeGreaterThanOrEqual(0.9);
  });

  it("scores by class name, display name and slot prefix; passives get nothing", () => {
    const haze = byName("Haze");
    const code = heroCodenames(haze, { abilityFolders: ["haze"], weaponFolders: ["haze"] });
    const id = (cls: string) => haze.abilities.find((a) => a.className === cls)!.id;
    expect(matchClip("abilities/haze/haze_sleep_dagger_cast", haze.abilities, code).abilityId).toBe(id("ability_sleep_dagger"));
    expect(matchClip("abilities/haze/a2_smoke_bomb/mod_start_lyr1", haze.abilities, code).abilityId).toBe(id("ability_smoke_bomb"));
    expect(matchClip("abilities/haze/haze_bullet_flurry_cast_start", haze.abilities, code).abilityId).toBe(id("ability_bullet_flurry"));
    expect(matchClip("abilities/haze/haze_random_emote", haze.abilities, code).abilityId).toBeNull();
    const abrams = byName("Abrams");
    const ac = heroCodenames(abrams, { abilityFolders: ["abrams"], weaponFolders: ["abrams"] });
    // "Siphon Life" spelled as one word in the file name.
    expect(matchClip("abilities/abrams/abrams_a1_siphonlife_cast", abrams.abilities, ac).abilityId)
      .toBe(abrams.abilities.find((a) => a.name === "Siphon Life")!.id);
  });

  it("guesses roles and default exclusions from the file name", () => {
    expect(guessRole("abilities/haze/haze_smoke_bomb_cast")).toBe("cast");
    expect(guessRole("abilities/haze/haze_bullet_flurry_cast_lp")).toBe("loop");
    expect(guessRole("abilities/synth/affliction/cast_05_impact")).toBe("impact");
    expect(guessRole("abilities/haze/haze_sleep_dagger_hit")).toBe("impact");
    expect(guessRole("abilities/haze/haze_smoke_bomb_invis_01")).toBe("other");
    expect(skipReason("abilities/haze/haze_sleep_dagger_whizby_03")).toBe("whiz-by");
    expect(skipReason("abilities/haze/haze_smoke_bomb_end")).toBe("end stinger");
    expect(skipReason("abilities/haze/haze_smoke_bomb_cast")).toBeNull();
  });

  it("picks the gun's fire family, never reloads or whiz-bys", () => {
    expect(isWeaponFire("weapons/haze/haze_weapon_fire_01")).toBe(true);
    expect(isWeaponFire("weapons/sinclair/magician_wpn_shoot_01")).toBe(true);
    expect(isWeaponFire("weapons/yamato/fire/10")).toBe(true);
    expect(isWeaponFire("weapons/sinclair/reload/sinclair_wpn_reload_end_01")).toBe(false);
    expect(isWeaponFire("weapons/pocket/pocket_weapon_whizby_groupa-001")).toBe(false);
  });
});

// ───────────── the mode ─────────────

const clip = (id: number, role: string, over: Partial<SoundData> = {}): SoundData => ({
  id, url: `/media/${String(id).padStart(40, "a").slice(-40).replace(/[^a-f0-9]/g, "b")}`, role, gainDb: -8, durationMs: 1500, preferred: false, ...over,
});
const ability = (id: number, heroId: number, slot: number, name: string, over: Partial<AbilityData> = {}): AbilityData => ({
  id, heroId, name, slot, aliases: [], exclude: [], icon: `/media/${"c".repeat(39)}${slot}`,
  src: { id, className: `ability_${name.toLowerCase().replace(/ /g, "_")}`, name, heroId, slot, image: null, description: "", quip: null, tiers: [null, null, null] },
  ...over,
});
const ctx = (data: ReturnType<typeof makeData>, seed = "s") => ({ data, rng: makeRng(seed), date: "2026-10-02", dayIndex: 1, analytics: noAnalytics });
const lookup = (data: ReturnType<typeof makeData>) => (id: string) => {
  const h = data.hero(Number(id));
  return h ? { id, name: h.name, icon: null } : undefined;
};

describe("The Resonance: eligibility", () => {
  const haze = hero(13, "Haze", { aliases: ["Sandman"] });
  const seven = hero(2, "Seven");
  const excluded = hero(3, "Warden", { exclude: ["hero-sound"] });
  const abilities = [
    ability(131, 13, 1, "Sleep Dagger"), ability(132, 13, 2, "Smoke Bomb"), ability(133, 13, 3, "Fixation"), ability(134, 13, 4, "Bullet Dance"),
    ability(21, 2, 1, "Lightning Ball"), ability(31, 3, 1, "Alchemical Flask"),
  ];
  const sounds = {
    131: [clip(1, "cast"), clip(2, "cast"), clip(11, "cast")], // eligible: three cast variants
    132: [clip(3, "impact"), clip(4, "loop")], // no cast: never picked
    134: [clip(5, "cast")], // one cast clip is enough
    21: [clip(6, "impact"), clip(7, "other")], // Seven: no cast anywhere -> not a candidate
    31: [clip(8, "cast"), clip(9, "cast")], // excluded hero
  };
  const data = makeData({ heroes: [haze, seven, excluded], abilities, sounds, codenames: { 13: ["haze"] } });

  it("needs an approved cast clip; excluded heroes never appear", () => {
    expect(soundEligible([{ role: "cast" }])).toBe(true);
    expect(soundEligible([{ role: "impact" }, { role: "loop" }])).toBe(false);
    expect(resonance.candidates(data, { dayIndex: 0 }).map((c) => c.ref)).toEqual([13]);
  });

  it("only ever picks an ability with a cast clip, and never an impact or loop", async () => {
    const abilityNames = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const p = await resonance.build({ answerId: "13", ref: 13 }, ctx(data, `seed${s}`));
      abilityNames.add(p.bonus!.reveal!.name);
      const urls = p.clue.clips.map((c) => c.url);
      const allowed = p.bonus!.reveal!.name === "Sleep Dagger" ? [1, 2, 11] : [5];
      expect(urls.every((u) => allowed.some((id) => u === clip(id, "cast").url))).toBe(true);
      expect(p.clue.slot).toBe(p.bonus!.reveal!.name === "Sleep Dagger" ? 1 : 4);
    }
    // An ability with several cast variants wins over one with a single clip...
    expect([...abilityNames]).toEqual(["Sleep Dagger"]);
    // ...but a single clip is enough when nothing else is available.
    const single = makeData({ heroes: [haze], abilities, sounds: { 134: sounds[134] } });
    const p = await resonance.build({ answerId: "13", ref: 13 }, ctx(single));
    expect(p.bonus!.reveal!.name).toBe("Bullet Dance");
    expect(p.clue.slot).toBe(4);
  });

  it("an ability excluded from the mode is never picked", () => {
    const noDagger = makeData({
      heroes: [haze], abilities: abilities.map((a) => (a.id === 131 ? { ...a, exclude: ["hero-sound"] } : a)), sounds: { 132: sounds[132] },
    });
    expect(resonance.candidates(noDagger, { dayIndex: 0 })).toEqual([]);
  });
});

describe("The Resonance: reveal ladder, slot, hints and leaks", () => {
  const haze = hero(13, "Haze", { aliases: ["Sandman"] });
  const others = [hero(1, "Infernus"), hero(2, "Seven"), hero(4, "Lash"), hero(5, "Shiv"), hero(6, "Wraith"), hero(7, "Vyper")];
  const abilities = [ability(131, 13, 1, "Sleep Dagger"), ability(132, 13, 2, "Smoke Bomb"), ability(133, 13, 3, "Fixation"), ability(134, 13, 4, "Bullet Dance")];
  const sounds = { 131: [clip(1, "cast"), clip(2, "cast"), clip(3, "cast")] };
  const data = makeData({ heroes: [haze, ...others], abilities, sounds, codenames: { 13: ["haze", "hazey_folder"] } });
  const lock = LOCK_BY_SLUG.resonance;
  const build = async () => {
    const p = await resonance.build({ answerId: "13", ref: 13 }, ctx(data));
    return { p, row: { date: "2026-10-02", mode: "resonance", sealed: false, sealedReason: null, payload: p } };
  };
  const wrongs = ["1", "2", "4", "5", "6", "7"];

  it("0: first cast sound · 1: second · 2: third · letter hints at 4 and 6", async () => {
    const { row } = await build();
    const at = (w: number) => evaluate(lock, row, 2, wrongs.slice(0, w), undefined, lookup(data));
    const clips = (w: number) => (at(w).clue as { clips: { url: string; label: string }[] }).clips;
    expect(clips(0)).toHaveLength(1);
    expect(clips(1)).toHaveLength(2);
    expect(clips(2).map((c) => c.label)).toEqual(["Sound 1", "Sound 2", "Sound 3"]);
    const unlocked = (w: number) => at(w).hints.filter((h) => h.unlocked).map((h) => [h.id, h.value]);
    expect(unlocked(3)).toEqual([]);
    expect(unlocked(4)).toEqual([["initial", "H"]]);
    expect(unlocked(6)).toEqual([["initial", "H"], ["initial2", "HA"]]);
  });

  it("shows the ability slot from the start", async () => {
    const { row } = await build();
    const slot = (guesses: string[]) => (evaluate(lock, row, 2, guesses, undefined, lookup(data)).clue as { slot?: number | null }).slot;
    expect(slot([])).toBe(1);
    expect(slot(["1"])).toBe(1);
  });

  it("a locked clip's URL is never sent early; only opaque audio URLs; no names or codenames before the win", async () => {
    const { p, row } = await build();
    const [, clip2, clip3] = p.clue.clips.map((c) => c.url);
    for (let w = 0; w <= 6; w++) {
      const json = JSON.stringify(evaluate(lock, row, 2, wrongs.slice(0, w), undefined, lookup(data)));
      if (w < 1) expect(json).not.toContain(clip2);
      if (w < 2) expect(json).not.toContain(clip3);
      for (const url of json.match(/"(?:url|audio)":"([^"]+)"/g) ?? []) expect(url.split('":"')[1].slice(0, -1)).toMatch(MEDIA_URL);
      for (const term of ["Haze", "haze", "Sandman", "Sleep Dagger", "hazey_folder", ".mp3", "http"]) expect(json).not.toContain(term);
    }
    expect(checkLeaks(p as BasePayload)).toEqual([]);
  });

  it("the ability is revealed only after the bonus pick (or when the lock jams)", async () => {
    const { row } = await build();
    const won = evaluate(lock, row, 2, ["1", "13"], undefined, lookup(data));
    expect(won.status).toBe("won");
    expect(JSON.stringify(won)).not.toContain("Sleep Dagger\",\"image");
    expect(won.bonus?.reveal).toBeUndefined();
    expect(won.bonus?.options.map((o) => o.name).sort()).toEqual(["Bullet Dance", "Fixation", "Sleep Dagger", "Smoke Bomb"]);
    const picked = evaluate(lock, row, 2, ["1", "13"], "132", lookup(data));
    expect(picked.bonus?.correct).toBe(false);
    expect(picked.bonus?.reveal?.name).toBe("Sleep Dagger");
    // After the win every clip plays unfiltered.
    expect((picked.clue as { clips: { label: string }[] }).clips.map((c) => c.label)).toEqual(["Sound 1", "Sound 2", "Sound 3"]);
    const jammed = evaluate(lock, row, 2, ["1"], undefined, lookup(data), { giveUp: true });
    expect(jammed.answer?.extra?.ability?.name).toBe("Sleep Dagger");
  });

  it("the leak validator flags non-opaque audio URLs and codenames", async () => {
    const { p } = await build();
    const leaky = { ...p, clue: { ...p.clue, clips: [{ url: "https://assets-bucket.deadlock-api.com/sounds/abilities/haze/haze_sleep_dagger_cast.mp3", gainDb: 0 }, p.clue.clips[1]] } };
    const leaks = checkLeaks(leaky as BasePayload);
    expect(leaks.map((l) => l.term)).toContain("non-opaque audio URL");
    expect(leaks.map((l) => l.term)).toContain("haze");
  });
});

describe("The Resonance: Skip sound locks", () => {
  const rec = (s: "won" | "lost", souls = 90) => ({ g: ["x"], s, w: 0, h: 0, souls });
  const skip = ignoredSlugs({ skipSound: true });

  it("drops out of the lock count and the combined share", () => {
    expect(LOCKS).toHaveLength(38); // 26 Vault locks + 3 boxes of 4 tables
    expect(countedLocks(true)).toHaveLength(37);
    expect(countedLocks(true).some((l) => l.slug === "resonance")).toBe(false);
    const results = { resonance: { status: "won" as const, guesses: 1, souls: 100 }, visage: { status: "won" as const, guesses: 2, souls: 90 } };
    const on = shareDay({ number: 5, results, streak: 1, site: "x", skip });
    const off = shareDay({ number: 5, results, streak: 1, site: "x" });
    expect(on).toContain("1/28 locks · 90 souls"); // 29 Vault units minus the skipped sound lock
    expect(off).toContain("2/29 locks · 190 souls");
    const spirits = (s: string) => [...s.split("\n")[1].replace("Spirits  ", "")].filter((ch) => ch !== "️").length;
    expect(spirits(off)).toBe(15);
    expect(spirits(on)).toBe(14);
  });

  it("doesn't affect streaks or souls", () => {
    const progress = {
      "2026-09-30": { visage: rec("won") },
      "2026-10-01": { resonance: rec("won") }, // only the sound lock was solved that day
      "2026-10-02": { visage: rec("won") },
    };
    expect(streaks(progress, "2026-10-02").current).toBe(3);
    expect(dayStreaks(progress, "2026-10-02", skip).current).toBe(1);
    expect(isDayUnlocked(progress["2026-10-01"], skip)).toBe(false);
    expect(daySouls({ resonance: rec("won", 100), visage: rec("won", 90) }, skip)).toBe(90);
  });
});

describe("The Resonance: loudness", () => {
  const SR = 44100;
  /** A decaying tone burst followed by silence, like an ability sound. */
  const burst = (amp: number, ms: number, tailMs: number, freq = 440) => {
    const n = Math.round(((ms + tailMs) / 1000) * SR);
    const out = new Float32Array(n);
    const on = Math.round((ms / 1000) * SR);
    for (let i = 0; i < on; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR) * (1 - (0.5 * i) / on);
    return out;
  };

  it("sampled clips land within ±2 dB of the target after their gain", () => {
    const clips = [
      [burst(0.9, 600, 1500)], [burst(0.5, 300, 2000, 880)], [burst(0.2, 1200, 300)], [burst(0.05, 800, 800, 220)],
      [burst(0.7, 250, 0), burst(0.6, 250, 0)], // stereo
    ];
    for (const ch of clips) {
      const m = measurePcm(ch, SR);
      const after = m.loudnessDb + gainFor(m);
      expect(Math.abs(after - LOUDNESS_TARGET_DB)).toBeLessThanOrEqual(2);
      expect(m.peakDb + gainFor(m)).toBeLessThanOrEqual(-1 + 0.05);
    }
  });

  it("measures duration and ignores the silent tail", () => {
    const short = measurePcm([burst(0.5, 400, 0)], SR);
    const tailed = measurePcm([burst(0.5, 400, 5000)], SR);
    expect(tailed.durationMs).toBe(5400);
    expect(Math.abs(tailed.loudnessDb - short.loudnessDb)).toBeLessThan(0.5);
  });

  it("never boosts a spiky clip past the peak ceiling", () => {
    const spike = new Float32Array(SR); // one loud click in a quiet second
    for (let i = 0; i < SR; i++) spike[i] = 0.001 * Math.sin(i / 7);
    spike[1000] = 0.5;
    const m = measurePcm([spike], SR);
    expect(m.peakDb + gainFor(m)).toBeLessThanOrEqual(-1 + 0.05);
  });
});
