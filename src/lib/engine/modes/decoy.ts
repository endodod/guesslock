// The Decoy: a hero's core build (the same analytics as The Belongings) with one item that doesn't belong. Find it.
// Normal mode names the hero; hard mode doesn't, so the build itself has to tell whose it is.
import { config } from "../../config";
import type { GameData, HeroData, ItemData } from "../context";
import { SealedError, SkipCandidate, type ModeImpl } from "../mode";
import { distinctiveItems } from "./hero";
import type { HeroItemStats } from "../../deadlock/api";

/** Real items shown next to the fake one. */
export const DECOY_REAL = 7;
/** The fake is bought in under 1% of this hero's matches (in the analytics window) … */
export const DECOY_MAX_PICK = 0.01;
/** … but is a normal item elsewhere: on average at least 3% of matches across heroes. */
export const DECOY_MIN_ELSEWHERE = 0.03;
/** Souls by wrong picks before finding it (3 picks: a lucky guess is 1 in 8). */
const DECOY_SOULS = [100, 50, 25];

type Card = { id: string; name: string; image: string | null; slot: string };
type DecoyClue = { hero: { name: string; image: string | null }; items: Card[]; fakeId: string };

const card = (i: ItemData): Card => ({ id: String(i.id), name: i.name, image: i.image, slot: i.src.slot });

/** Items that are clearly not part of this hero's build but are common on other heroes. */
export function fakeCandidates(heroId: number, data: Pick<GameData, "items">, stats: Pick<HeroItemStats, "heroMatches" | "itemMatches">, exclude: Set<number>): ItemData[] {
  const total = stats.heroMatches.get(heroId) ?? 0;
  if (total < config.analyticsMinHeroMatches) return [];
  const others = [...stats.heroMatches.entries()].filter(([hid, m]) => hid !== heroId && m >= config.analyticsMinHeroMatches);
  if (!others.length) return [];
  return data.items.filter((i) => {
    if (exclude.has(i.id) || !i.image || i.exclude.includes("decoy")) return false;
    const pr = (stats.itemMatches.get(heroId)?.get(i.id) ?? 0) / total;
    if (pr >= DECOY_MAX_PICK) return false;
    const avg = others.reduce((sum, [hid, m]) => sum + (stats.itemMatches.get(hid)?.get(i.id) ?? 0) / m, 0) / others.length;
    return avg >= DECOY_MIN_ELSEWHERE;
  });
}

export const decoy: ModeImpl<DecoyClue> = {
  mode: "decoy",
  hard: true,
  candidates: (data) => data.heroes.filter((h: HeroData) => h.eligible && !h.exclude.includes("decoy")).map((h) => ({ answerId: String(h.id), ref: h.id })),
  async build(c, { data, rng, analytics }) {
    const h = data.hero(c.ref as number)!;
    let stats: HeroItemStats;
    try {
      stats = await analytics();
    } catch (e) {
      throw new SealedError(`analytics unavailable: ${(e as Error).message}`);
    }
    // distinctiveItems lists least defining first: the last ones are the core of the build.
    const core = distinctiveItems(h.id, data, stats, h.setup).slice(-DECOY_REAL)
      .map((b) => data.items.find((i) => i.name === b.name))
      .filter((i): i is ItemData => !!i);
    if (core.length < DECOY_REAL) throw new SkipCandidate(`not enough item data for ${h.name}`);
    const fakes = fakeCandidates(h.id, data, stats, new Set(core.map((i) => i.id)));
    // Prefer a fake from a slot the build already uses, so the slot colour alone doesn't give it away.
    const slots = new Set(core.map((i) => i.src.slot));
    const sameSlot = fakes.filter((i) => slots.has(i.src.slot));
    if (!fakes.length) throw new SkipCandidate(`no clear fake item for ${h.name}`);
    const fake = rng.pick(sameSlot.length ? sameSlot : fakes);
    return {
      v: 1, mode: "decoy",
      answer: { ...card(fake), sub: h.name, extra: { hero: { name: h.name, image: h.card } } },
      correctIds: [String(fake.id)],
      // Every name shown is meant to be seen; nothing in the text can give the fake away.
      leakTerms: [],
      hints: {},
      clue: { hero: { name: h.name, image: h.card }, items: rng.shuffle([...core, fake].map(card)), fakeId: String(fake.id) },
    };
  },
  clue: (p, _wrong, done, opts = {}) => ({
    kind: "decoy",
    hero: opts.hard && !done ? null : p.clue.hero,
    items: p.clue.items,
  }),
  // A pick must be one of the shown items, each once.
  judge(p, guess, rows) {
    const it = p.clue.items.find((i) => i.id === guess);
    if (!it) return { rejected: "Pick one of the items in the build." };
    if (rows.some((r) => r.id === guess)) return { rejected: "Already picked." };
    const correct = guess === p.clue.fakeId;
    return { row: { id: guess, name: it.name, icon: it.image, sub: it.slot, correct }, wrong: !correct };
  },
  solved: (_p, rows) => rows.some((r) => r.correct),
  souls: (_p, r) => (r.won ? DECOY_SOULS[Math.min(r.wrong, DECOY_SOULS.length - 1)] : 0),
  displayed: (p) => p.clue.items.map((i) => i.name),
};
