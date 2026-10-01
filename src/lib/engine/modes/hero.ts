// Hero modes: Reckoning, Visage, Sigil, Testament, Incantation, Belongings, Ascension, Cipher, Echo, Resonance.
import { config } from "../../config";
import { activeColumns, formatCell, type CellValue } from "../columns";
import { compareCell } from "../compare";
import type { AbilityData, GameData, HeroData, SoundData } from "../context";
import { CENSOR, redact } from "../../text/redact";
import { SkipCandidate, SealedError, type BasePayload, type Candidate, type ModeImpl } from "../mode";
import type { ColumnMeta, SoundClipView, Tile } from "../types";

// ---------- helpers ----------

export function heroLeakTerms(h: HeroData): string[] {
  return [h.name, ...h.aliases];
}

function heroAnswer(h: HeroData) {
  return { id: String(h.id), name: h.name, image: h.card };
}

function heroPool(data: GameData, mode: string, extra: (h: HeroData) => boolean = () => true): Candidate[] {
  return data.heroes
    .filter((h) => h.eligible && !h.exclude.includes(mode) && extra(h))
    .map((h) => ({ answerId: String(h.id), ref: h.id }));
}

function usableAbilities(data: GameData, heroId: number, mode: string): AbilityData[] {
  return data.abilitiesOf(heroId).filter((a) => !a.exclude.includes(mode));
}

function bonusFor(data: GameData, heroId: number, answer: AbilityData, rng: { shuffle<T>(a: readonly T[]): T[] }) {
  const options = rng.shuffle(data.abilitiesOf(heroId)).map((a) => ({ id: String(a.id), name: a.name }));
  return { prompt: "Name the ability", options, answerId: String(answer.id) };
}

/** Split text into up to `n` chunks along sentence boundaries, roughly equal in length. */
export function chunkText(text: string, n: number): string[] {
  const sentences = text
    .replace(/\s*\n+\s*/g, " ")
    .split(/(?<=[.!?…])\s+(?=[A-Z"“‘'▇(])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= n) return sentences;
  // cumAt(e) = total length of sentences[0..e)
  const cumAt: number[] = [0];
  for (const s of sentences) cumAt.push(cumAt[cumAt.length - 1] + s.length);
  const total = cumAt[sentences.length];
  const chunks: string[] = [];
  let start = 0;
  for (let k = 0; k < n; k++) {
    const left = n - k; // chunks still to fill, including this one
    if (left === 1) {
      chunks.push(sentences.slice(start).join(" "));
      break;
    }
    // End this chunk at the boundary closest to its share of the text,
    // leaving at least one sentence for each remaining chunk.
    const target = (total * (k + 1)) / n;
    const maxEnd = sentences.length - (left - 1);
    let end = start + 1;
    while (end < maxEnd && Math.abs(cumAt[end + 1] - target) <= Math.abs(cumAt[end] - target)) end++;
    chunks.push(sentences.slice(start, end).join(" "));
    start = end;
  }
  return chunks;
}

// ---------- I. The Reckoning (classic) ----------

type GridClue = {
  columns: (ColumnMeta & { type: string })[];
  table: Record<string, { v: CellValue; d: string }[]>;
};

function gridTiles(p: BasePayload<GridClue>, guessId: string): Tile[] | null {
  const row = p.clue.table[guessId];
  const answer = p.clue.table[p.correctIds[0]];
  if (!answer) return null;
  return p.clue.columns.map((c, i) => {
    const g = row?.[i];
    if (!g) return { key: c.key, display: "?", result: "miss" as const };
    const r = compareCell(c.type as never, g.v, answer[i].v);
    return { key: c.key, display: g.d, result: r.result, arrow: r.arrow };
  });
}

/** Columns in play for The Reckoning (curated columns join once fully filled in). */
function reckoningColumns(data: GameData) {
  const pool = data.heroes.filter((h) => h.eligible && !h.exclude.includes("classic"));
  return activeColumns(data.heroColumns, pool, data);
}

export const reckoning: ModeImpl<GridClue> = {
  mode: "classic",
  candidates: (data) => {
    const cols = reckoningColumns(data);
    return heroPool(data, "classic", (h) => cols.every((c) => c.get(h, data) !== null));
  },
  build(c, { data }) {
    const h = data.hero(c.ref as number)!;
    const cols = reckoningColumns(data);
    const table: GridClue["table"] = {};
    for (const x of data.heroes)
      table[String(x.id)] = cols.map((col) => {
        const v = col.get(x, data);
        return { v, d: formatCell(col, v) };
      });
    return {
      v: 1, mode: "classic", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: {
        columns: cols.map((col) => ({ key: col.key, label: col.label, info: col.info, type: col.type, numeric: col.type === "numeric" || col.type === "date" })),
        table,
      },
    };
  },
  clue: (p) => ({ kind: "grid", columns: p.clue.columns.map(({ key, label, info, numeric }) => ({ key, label, info, numeric })) }),
  tiles: gridTiles,
  displayed: () => [],
};

// ---------- II. The Visage (splash) ----------

const ZOOM_STEPS = [5.2, 4.2, 3.4, 2.7, 2.2, 1.8, 1.45, 1.2, 1];

export const visage: ModeImpl<{ image: string; originX: number; originY: number }> = {
  mode: "splash",
  candidates: (data) => heroPool(data, "splash", (h) => !!h.splash),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    return {
      v: 1, mode: "splash", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      // Portrait cards have the face in the upper half: bias the crop there.
      clue: { image: h.splash!, originX: Math.round(25 + rng.next() * 50), originY: Math.round(18 + rng.next() * 42) },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "splash", image: p.clue.image, originX: p.clue.originX, originY: p.clue.originY,
    zoom: done ? 1 : ZOOM_STEPS[Math.min(wrong, ZOOM_STEPS.length - 1)],
  }),
  displayed: () => [],
};

// ---------- III. The Sigil (ability icon) ----------

const SIGIL_GRID = 4;
const SIGIL_START_OPEN = 3;

export const sigil: ModeImpl<{ image: string; order: number[] }> = {
  mode: "ability-icon",
  candidates: (data) => heroPool(data, "ability-icon", (h) => usableAbilities(data, h.id, "ability-icon").some((a) => a.icon)),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const ability = rng.pick(usableAbilities(data, h.id, "ability-icon").filter((a) => a.icon));
    const order = rng.shuffle(Array.from({ length: SIGIL_GRID * SIGIL_GRID }, (_, i) => i));
    return {
      v: 1, mode: "ability-icon", answer: heroAnswer(h), correctIds: [String(h.id)],
      leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      bonus: bonusFor(data, h.id, ability, rng),
      clue: { image: ability.icon!, order },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "sigil", image: p.clue.image, grid: SIGIL_GRID,
    covered: done ? [] : p.clue.order.slice(SIGIL_START_OPEN + wrong),
  }),
  displayed: () => [],
};

// ---------- IV. The Testament (lore) ----------

const LORE_CHUNKS = 6;

export const testament: ModeImpl<{ chunks: string[] }> = {
  mode: "lore",
  candidates: (data) => heroPool(data, "lore", (h) => !!data.text("hero_lore", h.id)),
  build(c, { data }) {
    const h = data.hero(c.ref as number)!;
    const chunks = chunkText(data.text("hero_lore", h.id)!, LORE_CHUNKS);
    return {
      v: 1, mode: "lore", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {},
      clue: { chunks },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "text",
    sections: p.clue.chunks.slice(0, done ? p.clue.chunks.length : 1 + wrong).map((text) => ({ text })),
    total: p.clue.chunks.length,
  }),
  displayed: (p) => p.clue.chunks,
};

// ---------- V. The Incantation (ability description) ----------

export const incantation: ModeImpl<{ text: string; abilityName: string }> = {
  mode: "ability-desc",
  candidates: (data) =>
    heroPool(data, "ability-desc", (h) => usableAbilities(data, h.id, "ability-desc").some((a) => data.text("ability_desc", a.id))),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const ability = rng.pick(usableAbilities(data, h.id, "ability-desc").filter((a) => data.text("ability_desc", a.id)));
    return {
      v: 1, mode: "ability-desc", answer: heroAnswer(h), correctIds: [String(h.id)],
      leakTerms: [...heroLeakTerms(h), ability.name, ...ability.aliases],
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      bonus: bonusFor(data, h.id, ability, rng),
      clue: { text: data.text("ability_desc", ability.id)!, abilityName: ability.name },
    };
  },
  clue: (p) => ({ kind: "text", sections: [{ text: p.clue.text }], total: 1 }),
  displayed: (p) => [p.clue.text],
};

// ---------- VI. The Belongings (whose build) ----------

type BuildItem = { name: string; image: string | null; slot: string; lift: number };
const BUILD_ITEMS = 8;

export const belongings: ModeImpl<{ items: BuildItem[]; path?: number[] }> = {
  mode: "whose-build",
  candidates: (data) => heroPool(data, "whose-build"),
  async build(c, { data, analytics, abilityOrder }) {
    const h = data.hero(c.ref as number)!;
    let stats;
    try {
      stats = await analytics();
    } catch (e) {
      throw new SealedError(`analytics unavailable: ${(e as Error).message}`);
    }
    const items = distinctiveItems(h.id, data, stats, h.setup);
    if (items.length < 5) throw new SkipCandidate(`not enough item data for ${h.name}`);
    const path = abilityPath(data.abilitiesOf(h.id), await abilityOrder?.(h.id));
    return {
      v: 1, mode: "whose-build", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { items, ...(path ? { path } : {}) },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "build",
    path: p.clue.path,
    items: p.clue.items.slice(0, done ? p.clue.items.length : 1 + wrong).map(({ name, image, slot }) => ({ name, image, slot })),
    total: p.clue.items.length,
  }),
  displayed: (p) => p.clue.items.map((i) => i.name),
};

/** Ability ids in point order -> ability slots 1-4; null when an id is unknown (the path is left out). */
export function abilityPath(abilities: Pick<AbilityData, "id" | "slot">[], order: number[] | null | undefined): number[] | null {
  if (!order?.length) return null;
  const slots = new Map(abilities.map((a) => [a.id, a.slot]));
  const path = order.map((id) => slots.get(id));
  return path.every((s): s is number => s !== undefined) ? path : null;
}

/**
 * Core items of a hero: the items that are both bought a lot on this hero and unusually popular on it
 * (score = pick rate x lift, lift = hero pick rate / average pick rate across heroes).
 * Returns the top 8, ordered least defining first (the reveal order).
 * Admin setup: banned items never show; pinned items always do, as the most telling (last) ones.
 */
export function distinctiveItems(
  heroId: number,
  data: Pick<GameData, "items">,
  stats: { heroMatches: Map<number, number>; itemMatches: Map<number, Map<number, number>> },
  setup: Pick<HeroData["setup"], "buildPin" | "buildBan"> = {},
): BuildItem[] {
  const ban = new Set([...(setup.buildBan ?? []), ...(setup.buildPin ?? [])]);
  const pinned = (setup.buildPin ?? [])
    .map((cls) => data.items.find((i) => i.src.className === cls))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .slice(0, BUILD_ITEMS)
    .map((i): BuildItem => ({ name: i.name, image: i.image, slot: i.src.slot, lift: 999 }));
  const heroTotal = stats.heroMatches.get(heroId) ?? 0;
  if (heroTotal < config.analyticsMinHeroMatches) return pinned.length >= 5 ? pinned.reverse() : [];
  const heroesWithData = [...stats.heroMatches.entries()].filter(([, m]) => m >= config.analyticsMinHeroMatches);
  const scored: (BuildItem & { score: number })[] = [];
  for (const item of data.items) {
    if (ban.has(item.src.className)) continue;
    const pr = (stats.itemMatches.get(heroId)?.get(item.id) ?? 0) / heroTotal;
    if (pr < config.analyticsMinPickRate) continue;
    const avg =
      heroesWithData.reduce((sum, [hid, m]) => sum + (stats.itemMatches.get(hid)?.get(item.id) ?? 0) / m, 0) / heroesWithData.length;
    if (avg <= 0) continue;
    const lift = pr / avg;
    scored.push({ name: item.name, image: item.image, slot: item.src.slot, lift: Math.round(lift * 1000) / 1000, score: pr * lift });
  }
  return [...pinned, ...scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map(({ name, image, slot, lift }) => ({ name, image, slot, lift }))]
    .slice(0, BUILD_ITEMS)
    .reverse();
}

// ---------- VII. The Ascension (upgrades) ----------

type AscClue = { tiers: string[]; icon: string | null };

export const ascension: ModeImpl<AscClue> = {
  mode: "upgrades",
  candidates: (data) =>
    data.abilities
      .filter((a) => {
        const h = data.hero(a.heroId);
        return h?.eligible && !h.exclude.includes("upgrades") && !a.exclude.includes("upgrades") &&
          ["ability_t1", "ability_t2", "ability_t3"].every((t) => data.text(t, a.id));
      })
      .map((a) => ({ answerId: String(a.id), ref: a.id })),
  build(c, { data }) {
    const a = data.ability(c.ref as number)!;
    const h = data.hero(a.heroId)!;
    return {
      v: 1, mode: "upgrades",
      answer: { id: String(a.id), name: a.name, image: a.icon, sub: h.name, extra: { hero: { name: h.name, image: h.card } } },
      correctIds: [String(a.id)],
      leakTerms: [a.name, ...a.aliases, ...heroLeakTerms(h)],
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      // T3 first, then T2, then T1
      clue: { tiers: [data.text("ability_t3", a.id)!, data.text("ability_t2", a.id)!, data.text("ability_t1", a.id)!], icon: a.icon },
    };
  },
  clue: (p, wrong, done) => {
    const labels = ["Tier III", "Tier II", "Tier I"];
    const n = done ? 3 : Math.min(3, 1 + wrong);
    return {
      kind: "text",
      sections: p.clue.tiers.slice(0, n).map((text, i) => ({ label: labels[i], text })),
      total: 3,
      image: done || wrong >= 3 ? p.clue.icon : null,
    };
  },
  displayed: (p) => p.clue.tiers,
};

// ---------- VIII. The Cipher (emoji) ----------

/** Each hero has 10 emojis (hardest first); a puzzle shows 5 of them, so a hero looks different each time. */
export const EMOJI_SET_SIZE = 10;
export const EMOJI_PUZZLE_SIZE = 5;

/**
 * Seeded pick of 5 of a hero's 10 emojis, kept in hardest-to-easiest order. One always comes from the
 * 3 most obvious so the last reveal is a real giveaway.
 */
export function pickEmojis(set: string[], rng: { int(n: number): number; shuffle<T>(a: readonly T[]): T[] }): string[] {
  const easy = set.length - 3 + rng.int(3);
  const rest = rng.shuffle(Array.from({ length: set.length - 3 }, (_, i) => i)).slice(0, EMOJI_PUZZLE_SIZE - 1);
  return [...rest, easy].sort((a, b) => a - b).map((i) => set[i]);
}

export const cipher: ModeImpl<{ emojis: string[] }> = {
  mode: "emoji",
  candidates: (data) => heroPool(data, "emoji", (h) => h.emojis.length >= EMOJI_SET_SIZE),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    return {
      v: 1, mode: "emoji", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      // Only the 5 picked emojis are frozen into the puzzle.
      clue: { emojis: pickEmojis(h.emojis.slice(0, EMOJI_SET_SIZE), rng) },
    };
  },
  clue: (p, wrong, done) => {
    const n = done ? EMOJI_PUZZLE_SIZE : Math.min(EMOJI_PUZZLE_SIZE, 1 + wrong);
    return { kind: "emoji", slots: p.clue.emojis.map((e, i) => (i < n ? e : null)) };
  },
  displayed: (p) => p.clue.emojis,
};

// ---------- IX. The Echo family (voice lines from the wiki) ----------
// Three locks, each a different hero: Select lines (The Echo), what a hero says when casting one ability
// (The Utterance) and a complete conversation with another hero (The Colloquy).

export const ECHO_MIN_LINES = 5;
const ECHO_LINES = 5;
const CAST_MIN_LINES = 4;

type EchoPayload = { lines: string[] };
/** Puzzles frozen before The Echo moved to Select lines stored { text, audio } objects. */
const lineText = (l: string | { text: string }) => (typeof l === "string" ? l : l.text);

/** Hard mode for Select lines: the start or the end of every line is blacked out (alternating, so both occur). */
export function hideHalf(text: string, index: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return text;
  const keep = Math.ceil(words.length / 2);
  return index % 2 === 0 ? `${CENSOR} ${words.slice(words.length - keep).join(" ")}` : `${words.slice(0, keep).join(" ")} ${CENSOR}`;
}

const echoLeak = (h: HeroData, data: GameData) => [...heroLeakTerms(h), ...data.abilitiesOf(h.id).map((a) => a.name), ...data.soundCodenames(h.id)];

export const echo: ModeImpl<EchoPayload> = {
  mode: "quote",
  candidates: (data) => heroPool(data, "quote", (h) => data.voiceEntries(h.id, "select").length >= ECHO_MIN_LINES),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const lines = rng.shuffle(data.voiceEntries(h.id, "select")).slice(0, ECHO_LINES).map((e) => e.text!);
    return {
      v: 1, mode: "quote",
      answer: { ...heroAnswer(h), extra: { lines: lines.map((text) => ({ text })) } },
      correctIds: [String(h.id)], leakTerms: echoLeak(h, data),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { lines },
    };
  },
  clue: (p, wrong, done, hard) => ({
    kind: "echo",
    lines: p.clue.lines.slice(0, done ? p.clue.lines.length : 1 + wrong).map((l, i) => ({ text: hard && !done ? hideHalf(lineText(l), i) : lineText(l) })),
    total: p.clue.lines.length,
  }),
  displayed: (p) => p.clue.lines.map(lineText),
};

type CastPayload = { lines: string[]; slot: number };

export function slotName(slot: number): string {
  return slot === 4 ? "the Ultimate" : `Ability ${slot}`;
}

export const utterance: ModeImpl<CastPayload> = {
  mode: "quote-cast",
  candidates: (data) =>
    heroPool(data, "quote-cast", (h) => usableAbilities(data, h.id, "quote-cast").some((a) => data.voiceEntries(h.id, "cast").filter((e) => e.abilityId === a.id).length >= CAST_MIN_LINES)),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const casts = data.voiceEntries(h.id, "cast");
    const ability = rng.pick(usableAbilities(data, h.id, "quote-cast").filter((a) => casts.filter((e) => e.abilityId === a.id).length >= CAST_MIN_LINES));
    const lines = rng.shuffle(casts.filter((e) => e.abilityId === ability.id)).slice(0, ECHO_LINES).map((e) => e.text!);
    return {
      v: 1, mode: "quote-cast",
      answer: { ...heroAnswer(h), extra: { lines: lines.map((text) => ({ text })), ability: { name: ability.name, image: ability.icon } } },
      correctIds: [String(h.id)], leakTerms: [...echoLeak(h, data), ability.name, ...ability.aliases],
      hints: {},
      bonus: { ...bonusFor(data, h.id, ability, rng), reveal: { name: ability.name, image: ability.icon } },
      clue: { lines, slot: ability.slot },
    };
  },
  clue: (p, wrong, done, hard) => ({
    kind: "echo",
    lines: p.clue.lines.slice(0, done ? p.clue.lines.length : 1 + wrong).map((text) => ({ text })),
    total: p.clue.lines.length,
    // Hard mode does not say which ability the hero is casting.
    note: hard && !done ? "Said while casting an ability" : `Said when casting ${slotName(p.clue.slot)}`,
  }),
  displayed: (p) => p.clue.lines,
};

type ConvoPayload = { lines: { h: number; t: string }[]; heroId: number; other: { name: string; image: string | null; terms: string[] } };

export const colloquy: ModeImpl<ConvoPayload> = {
  mode: "quote-convo",
  candidates: (data) => heroPool(data, "quote-convo", (h) => data.voiceEntries(h.id, "convo").some((e) => e.otherHeroId !== null && data.hero(e.otherHeroId))),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const usable = data.voiceEntries(h.id, "convo").filter((e) => e.otherHeroId !== null && data.hero(e.otherHeroId));
    // Prefer conversations of 3+ lines: each wrong guess reveals the next one.
    const long = usable.filter((e) => (e.lines?.length ?? 0) >= 3);
    const convo = rng.pick(long.length ? long : usable);
    const other = data.hero(convo.otherHeroId!)!;
    const lines = convo.lines!;
    return {
      v: 1, mode: "quote-convo",
      answer: { ...heroAnswer(h), extra: { lines: lines.map((l) => ({ text: l.t })), partner: { name: other.name, image: other.card } } },
      correctIds: [String(h.id)], leakTerms: echoLeak(h, data),
      hints: {},
      clue: { lines, heroId: h.id, other: { name: other.name, image: other.icon, terms: heroLeakTerms(other) } },
    };
  },
  clue: (p, wrong, done, hard) => {
    const hide = hard && !done;
    const blank = (t: string) => (hide ? redact(t, p.clue.other.terms.map((term) => ({ term }))).text : t);
    return {
      kind: "convo",
      lines: p.clue.lines.slice(0, done ? p.clue.lines.length : Math.min(p.clue.lines.length, 1 + wrong)).map((l) => ({ mine: l.h === p.clue.heroId, text: blank(l.t) })),
      total: p.clue.lines.length,
      other: hide ? null : { name: p.clue.other.name, image: p.clue.other.image },
    };
  },
  displayed: (p) => p.clue.lines.map((l) => l.t),
};

// ---------- X. The Resonance (ability cast sound) ----------

type SoundRef = { url: string; gainDb: number };

/** An ability can be an answer when it has at least one approved cast clip. */
export function soundEligible(clips: Pick<SoundData, "role">[]): boolean {
  return clips.some((c) => c.role === "cast");
}

const soundRef = (c: SoundData): SoundRef => ({ url: c.url, gainDb: c.gainDb });
/** Clips of one ability heard over the course of the puzzle (wrong guesses add a variant). */
const RESONANCE_CLIPS = 3;

export const resonance: ModeImpl<{ clips: SoundRef[]; slot: number }> = {
  mode: "hero-sound",
  candidates: (data) =>
    heroPool(data, "hero-sound", (h) => usableAbilities(data, h.id, "hero-sound").some((a) => soundEligible(data.abilitySounds(a.id)))),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const eligible = usableAbilities(data, h.id, "hero-sound").filter((a) => soundEligible(data.abilitySounds(a.id)));
    // Prefer an ability with several cast variants: they are what wrong guesses unlock.
    const rich = eligible.filter((a) => data.abilitySounds(a.id).filter((s) => s.role === "cast").length >= 2);
    const ability = rng.pick(rich.length ? rich : eligible);
    const casts = data.abilitySounds(ability.id).filter((s) => s.role === "cast");
    const first = casts.find((s) => s.preferred) ?? rng.pick(casts);
    const clips = [first, ...rng.shuffle(casts.filter((s) => s.id !== first.id))].slice(0, RESONANCE_CLIPS);
    return {
      v: 1, mode: "hero-sound", answer: heroAnswer(h), correctIds: [String(h.id)],
      // Codenames too: they are in every upstream URL, so none may ever reach the player.
      leakTerms: [...heroLeakTerms(h), ...data.soundCodenames(h.id), ability.name, ...ability.aliases],
      hints: {}, // letter hints come from the answer name (engine/play.ts), like every other lock
      bonus: { ...bonusFor(data, h.id, ability, rng), reveal: { name: ability.name, image: ability.icon } },
      clue: { clips: clips.map(soundRef), slot: ability.slot },
    };
  },
  // 0 wrong: clip 1 muffled · 1: clip 1 clear · 2: a second cast sound · 3+: a third. Locked clips' URLs are never sent.
  // The ability slot is shown, except in hard mode.
  clue: (p, wrong, done, hard) => {
    const n = done ? p.clue.clips.length : wrong < 2 ? 1 : Math.min(p.clue.clips.length, wrong);
    const clips: SoundClipView[] = p.clue.clips.slice(0, n).map((c, i) => ({
      url: c.url, gainDb: c.gainDb, label: `Sound ${i + 1}`, muffled: !done && i === 0 && wrong === 0,
    }));
    return { kind: "sound", total: p.clue.clips.length, clips, slot: hard && !done ? null : p.clue.slot };
  },
  displayed: () => [],
  audio: (p) => p.clue.clips.map((c) => c.url),
};
