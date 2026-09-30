// Hero modes: Reckoning, Visage, Sigil, Testament, Incantation, Belongings, Ascension, Cipher, Echo, Resonance.
import { config } from "../../config";
import { activeColumns, formatCell, type CellValue } from "../columns";
import { compareCell } from "../compare";
import type { AbilityData, GameData, HeroData, SoundData } from "../context";
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

export const belongings: ModeImpl<{ items: BuildItem[] }> = {
  mode: "whose-build",
  candidates: (data) => heroPool(data, "whose-build"),
  async build(c, { data, analytics }) {
    const h = data.hero(c.ref as number)!;
    let stats;
    try {
      stats = await analytics();
    } catch (e) {
      throw new SealedError(`analytics unavailable: ${(e as Error).message}`);
    }
    const items = distinctiveItems(h.id, data, stats, h.setup);
    if (items.length < 5) throw new SkipCandidate(`not enough item data for ${h.name}`);
    return {
      v: 1, mode: "whose-build", answer: heroAnswer(h), correctIds: [String(h.id)], leakTerms: heroLeakTerms(h),
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { items },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "build",
    items: p.clue.items.slice(0, done ? p.clue.items.length : 1 + wrong).map(({ name, image, slot }) => ({ name, image, slot })),
    total: p.clue.items.length,
  }),
  displayed: (p) => p.clue.items.map((i) => i.name),
};

/**
 * Most distinctive items for a hero: lift = hero pick rate / average pick rate across heroes.
 * Returns the top 8, ordered least distinctive first (the reveal order).
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
  const scored: BuildItem[] = [];
  for (const item of data.items) {
    if (ban.has(item.src.className)) continue;
    const pr = (stats.itemMatches.get(heroId)?.get(item.id) ?? 0) / heroTotal;
    if (pr < config.analyticsMinPickRate) continue;
    const avg =
      heroesWithData.reduce((sum, [hid, m]) => sum + (stats.itemMatches.get(hid)?.get(item.id) ?? 0) / m, 0) / heroesWithData.length;
    if (avg <= 0) continue;
    scored.push({ name: item.name, image: item.image, slot: item.src.slot, lift: Math.round((pr / avg) * 1000) / 1000 });
  }
  return [...pinned, ...scored.sort((a, b) => b.lift - a.lift || a.name.localeCompare(b.name))]
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

// ---------- IX. The Echo (quote) ----------

type EchoLine = { text: string; audio: string | null };
export const ECHO_MIN_LINES = 5;

/** 4 regular lines in seeded order, then a starred (iconic) line last if one exists. */
export function pickEchoLines(
  lines: { text: string; audio: string | null; starred: boolean }[],
  rng: { shuffle<T>(a: readonly T[]): T[] },
): EchoLine[] {
  const starred = rng.shuffle(lines.filter((l) => l.starred));
  const regular = rng.shuffle(lines.filter((l) => !l.starred));
  const last = starred[0];
  const pool = [...regular, ...starred.slice(1)];
  const picked = last ? [...pool.slice(0, 4), last] : pool.slice(0, 5);
  return picked.map(({ text, audio }) => ({ text, audio }));
}

export const echo: ModeImpl<{ lines: EchoLine[] }> = {
  mode: "quote",
  candidates: (data) => heroPool(data, "quote", (h) => !h.genericVoice && data.voiceLines(h.id).length >= ECHO_MIN_LINES),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const lines = pickEchoLines(data.voiceLines(h.id), rng);
    return {
      v: 1, mode: "quote",
      answer: { ...heroAnswer(h), extra: { lines } },
      correctIds: [String(h.id)],
      leakTerms: [...heroLeakTerms(h), ...data.abilitiesOf(h.id).map((a) => a.name)],
      hints: {}, // letter hints come from the answer name (engine/play.ts)
      clue: { lines },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "echo",
    lines: p.clue.lines.slice(0, done ? p.clue.lines.length : 1 + wrong).map((l) => ({ text: l.text, audio: done ? l.audio : null })),
    total: p.clue.lines.length,
  }),
  displayed: (p) => p.clue.lines.map((l) => l.text),
};

// ---------- X. The Resonance (ability sound) ----------

type SoundRef = { url: string; gainDb: number };

/** An ability can be an answer with ≥ 1 approved cast clip and ≥ 2 approved clips in total. */
export function soundEligible(clips: Pick<SoundData, "role">[]): boolean {
  return clips.length >= 2 && clips.some((c) => c.role === "cast");
}

const CLIP2_ROLES = ["impact", "loop", "other", "cast"];

/** Clip 1: the starred cast clip, else a seeded cast. Clip 2: another clip, preferring impact > loop > other > cast. */
export function pickResonanceClips(clips: SoundData[], rng: { pick<T>(a: readonly T[]): T }): [SoundData, SoundData] {
  const casts = clips.filter((c) => c.role === "cast");
  const first = casts.find((c) => c.preferred) ?? rng.pick(casts);
  const rest = clips.filter((c) => c.id !== first.id);
  const role = CLIP2_ROLES.find((r) => rest.some((c) => c.role === r))!;
  return [first, rng.pick(rest.filter((c) => c.role === role))];
}

const soundRef = (c: SoundData): SoundRef => ({ url: c.url, gainDb: c.gainDb });

/** After this many wrong guesses the hero's gun sound joins the clue (if an approved gun clip exists). */
const GUN_AFTER = 3;

export const resonance: ModeImpl<{ clips: SoundRef[]; gun?: SoundRef | null }> = {
  mode: "hero-sound",
  candidates: (data) =>
    heroPool(data, "hero-sound", (h) => usableAbilities(data, h.id, "hero-sound").some((a) => soundEligible(data.abilitySounds(a.id)))),
  build(c, { data, rng }) {
    const h = data.hero(c.ref as number)!;
    const ability = rng.pick(usableAbilities(data, h.id, "hero-sound").filter((a) => soundEligible(data.abilitySounds(a.id))));
    const [one, two] = pickResonanceClips(data.abilitySounds(ability.id), rng);
    const guns = data.weaponSounds(h.id);
    const gun = guns.find((g) => g.preferred) ?? (guns.length ? rng.pick(guns) : null);
    return {
      v: 1, mode: "hero-sound", answer: heroAnswer(h), correctIds: [String(h.id)],
      // Codenames too: they are in every upstream URL, so none may ever reach the player.
      leakTerms: [...heroLeakTerms(h), ...data.soundCodenames(h.id), ability.name, ...ability.aliases],
      hints: {}, // letter hints come from the answer name (engine/play.ts), like every other lock
      bonus: { ...bonusFor(data, h.id, ability, rng), reveal: { name: ability.name, image: ability.icon } },
      clue: { clips: [soundRef(one), soundRef(two)], gun: gun ? soundRef(gun) : null },
    };
  },
  // 0 wrong: clip 1 muffled · 1: clip 1 clear · 2: clip 2 as well · 3+: the hero's gun sound.
  // Locked clips' URLs are never sent.
  clue: (p, wrong, done) => {
    const clips: SoundClipView[] = p.clue.clips.slice(0, done || wrong >= 2 ? p.clue.clips.length : 1).map((c, i) => ({
      url: c.url, gainDb: c.gainDb, label: `Sound ${i + 1}`, muffled: !done && i === 0 && wrong === 0,
    }));
    const gun = p.clue.gun;
    if (gun && (done || wrong >= GUN_AFTER)) clips.push({ url: gun.url, gainDb: gun.gainDb, label: "Gun", muffled: false });
    return { kind: "sound", total: p.clue.clips.length + (gun ? 1 : 0), clips };
  },
  displayed: () => [],
  audio: (p) => [...p.clue.clips.map((c) => c.url), ...(p.clue.gun ? [p.clue.gun.url] : [])],
};
