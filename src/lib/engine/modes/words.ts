// The word locks. The Lexicon: guess a five-letter Deadlock word letter by letter (Wordle rules). The Crossword: a small crossword
// of hero, item and ability names, clued by their (redacted) lore and descriptions.
import { buildCorpus, toWord, type WordEntry, type WordKind } from "../../words/corpus";
import { LORE_WORDS } from "../../words/lexicon-extra";
import type { GameData } from "../context";
import { layoutCrossword, type Dir } from "../../words/crossword";
import { findLeaks } from "../../text/redact";
import { SealedError, SkipCandidate, type ModeImpl } from "../mode";
import type { GuessRow, Tile, TileResult } from "../types";

const KIND_LABEL: Record<WordKind, string> = { hero: "A hero", item: "A shop item", ability: "An ability" };

// ───────────── The Lexicon ─────────────

/** Every Lexicon word has this many letters, like Wordle: the board and the player's habits stay the same each day. */
export const LEXICON_LENGTH = 5;
/** Same as the lock's maxTries (locks.config.ts). */
export const LEXICON_TRIES = 6;

/**
 * Where a Lexicon word comes from: a whole name (SEVEN), one word of a longer name (TALON from Grey Talon), a hero's
 * codename in the game files (ASTRO: Holliday), or a term from the Deadlock world (SOULS, see lexicon-extra.ts).
 */
export type LexiconSource = "name" | "part" | "codename" | "lore";
export type LexiconEntry = { word: string; name: string; image: string | null; source: LexiconSource; kind: WordKind | null; note: string | null };

type LexiconClue = { word: string; kind: WordKind | "lore"; source?: LexiconSource };

const PART_LABEL: Record<WordKind, string> = { hero: "Part of a hero's name", item: "Part of a shop item's name", ability: "Part of an ability's name" };

/** What the hint after three wrong guesses says: the kind of word, never the word. */
export function lexiconHint(e: Pick<LexiconEntry, "source" | "kind">): string {
  if (e.source === "lore") return "From the Deadlock world";
  if (e.source === "codename") return "A hero's codename in the game files";
  return e.source === "part" ? PART_LABEL[e.kind!] : KIND_LABEL[e.kind!];
}

/** Wordle colouring: exact letters first, then the remaining letters left to right, each answer letter used once. */
export function scoreWord(guess: string, answer: string): TileResult[] {
  const out: TileResult[] = Array(guess.length).fill("miss");
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) out[i] = "match";
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === "match") continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) { out[i] = "partial"; left.set(guess[i], n - 1); }
  }
  return out;
}

const fits = (w: string | null): w is string => !!w && w.length === LEXICON_LENGTH;

/** Every Lexicon word, one entry per word: whole names first, then words inside names, codenames, Deadlock terms. */
export function lexiconWords(data: GameData): LexiconEntry[] {
  const corpus: WordEntry[] = buildCorpus(data, "lexicon");
  const out = new Map<string, LexiconEntry>();
  const add = (e: LexiconEntry) => { if (!out.has(e.word)) out.set(e.word, e); };
  for (const e of corpus) if (fits(e.word)) add({ word: e.word, name: e.name, image: e.image, source: "name", kind: e.kind, note: null });
  for (const e of corpus) {
    const words = e.name.split(/[\s-]+/);
    if (words.length < 2) continue;
    for (const w of words.map(toWord)) if (fits(w)) add({ word: w, name: e.name, image: e.image, source: "part", kind: e.kind, note: null });
  }
  for (const h of data.heroes) {
    if (!h.eligible || h.exclude.includes("lexicon")) continue;
    const code = toWord(h.className.replace(/^hero_/, ""));
    if (fits(code) && code !== toWord(h.name)) add({ word: code, name: h.name, image: h.icon, source: "codename", kind: "hero", note: `Codename in the game files: ${code[0]}${code.slice(1).toLowerCase()}` });
  }
  for (const l of LORE_WORDS) if (fits(l.word)) add({ word: l.word, name: l.name, image: null, source: "lore", kind: null, note: l.note });
  return [...out.values()];
}

export const lexicon: ModeImpl<LexiconClue> = {
  mode: "lexicon",
  candidates: (data) => lexiconWords(data).map((e) => ({ answerId: e.word, ref: e.word })),
  build(c, { data }) {
    const e = lexiconWords(data).find((x) => x.word === c.answerId);
    if (!e) throw new SkipCandidate();
    const hint = lexiconHint(e);
    return {
      v: 1, mode: "lexicon",
      answer: { id: e.word, name: e.name, image: e.image, sub: e.note ?? (e.source === "part" ? `${KIND_LABEL[e.kind!]}: the word was ${e.word}` : hint) },
      correctIds: [e.word], leakTerms: [], hints: { kind: { value: hint } },
      clue: { word: e.word, kind: e.kind ?? "lore", source: e.source },
    };
  },
  clue: (p) => ({ kind: "lexicon", length: p.clue.word.length, tries: LEXICON_TRIES }),
  judge(p, guess) {
    const g = guess.toUpperCase();
    if (!/^[A-Z]+$/.test(g)) return { rejected: "Letters only." };
    if (g.length !== p.clue.word.length) return { rejected: `The word has ${p.clue.word.length} letters.` };
    const tiles: Tile[] = scoreWord(g, p.clue.word).map((result, i) => ({ key: String(i), display: g[i], result }));
    const correct = g === p.clue.word;
    return { row: { id: g, name: g, icon: null, correct, tiles }, wrong: !correct };
  },
  solved: (p, rows) => rows.some((r) => r.id === p.clue.word),
  displayed: () => [],
};

// ───────────── The Crossword ─────────────

type CrosswordWord = { n: number; dir: Dir; x: number; y: number; word: string; clue: string; name: string; image: string | null };
type CrosswordClue = { w: number; h: number; words: CrosswordWord[] };

const CROSSWORD_MIN_LEN = 3;
const CROSSWORD_MAX_LEN = 10;
/** Wrong checks before the crossword jams (a check with a wrong word in it). */
export const CROSSWORD_TRIES = 4;

/** A check: every word in clue order, "." for a blank letter, joined by "|". Null when malformed. */
export function parseCheck(guess: string, words: { word: string }[]): string[] | null {
  const parts = guess.toUpperCase().split("|");
  if (parts.length !== words.length) return null;
  for (let i = 0; i < parts.length; i++) if (parts[i].length !== words[i].word.length || !/^[A-Z.]+$/.test(parts[i])) return null;
  return parts;
}

/** Indices of the words some check got right. */
export function solvedWords(words: { word: string }[], rows: GuessRow[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows) {
    const parts = parseCheck(r.id, words);
    parts?.forEach((p, i) => p === words[i].word && out.add(i));
  }
  return out;
}

export const crossword: ModeImpl<CrosswordClue> = {
  mode: "crossword",
  selfPicked: true,
  candidates: () => [{ answerId: "crossword", ref: 0 }],
  build(_c, { data, rng }) {
    const pool = buildCorpus(data, "crossword").filter((e) => e.clue && e.word.length >= CROSSWORD_MIN_LEN && e.word.length <= CROSSWORD_MAX_LEN);
    if (pool.length < 12) throw new SealedError("too few clued words for a crossword");
    const banned = new Set<string>();
    for (let attempt = 0; attempt < 30; attempt++) {
      // Long words first make a sturdier spine; the rest in random order.
      const shuffled = rng.shuffle(pool.filter((e) => !banned.has(e.word)));
      const spine = shuffled.filter((e) => e.word.length >= 6).slice(0, 2);
      const order = [...spine, ...shuffled.filter((e) => !spine.includes(e))];
      const layout = layoutCrossword(order.map((e) => e.word), rng, { target: 8, min: 6, maxSize: 13 });
      if (!layout) continue;
      const byWord = new Map(pool.map((e) => [e.word, e]));
      const entries = layout.words.map((p) => ({ p, e: byWord.get(p.word)! }));
      // No clue may name any word of the grid.
      const terms = entries.flatMap(({ e }) => e.terms);
      const leaky = entries.find(({ e }) => findLeaks(e.clue!, terms).length);
      if (leaky) { banned.add(leaky.e.word); continue; }
      return {
        v: 1, mode: "crossword", key: `crossword:${entries.map(({ e }) => e.word).sort().join(",")}`,
        answer: { id: "crossword", name: "The full grid", image: null, images: entries.flatMap(({ e }) => (e.image ? [e.image] : [])).slice(0, 4) },
        correctIds: [], leakTerms: terms, hints: {},
        clue: {
          w: layout.w, h: layout.h,
          words: entries.map(({ p, e }) => ({ n: p.n, dir: p.dir, x: p.x, y: p.y, word: p.word, clue: e.clue!, name: e.name, image: e.image })),
        },
      };
    }
    throw new SealedError("no crossword layout found");
  },
  clue: (p, _wrong, done, _opts, rows = []) => {
    const solved = solvedWords(p.clue.words, rows);
    return {
      kind: "crossword", w: p.clue.w, h: p.clue.h,
      words: p.clue.words.map((w, i) => ({
        n: w.n, dir: w.dir, x: w.x, y: w.y, len: w.word.length, clue: w.clue,
        solved: solved.has(i) || done ? w.word : null,
        ...(done ? { answer: { name: w.name, image: w.image } } : {}),
      })),
    };
  },
  judge(p, guess, rows) {
    const parts = parseCheck(guess, p.clue.words);
    if (!parts) return { rejected: "Fill in a word before checking." };
    const before = solvedWords(p.clue.words, rows);
    const full = parts.map((x, i) => (x.includes(".") || before.has(i) ? null : x));
    if (!full.some(Boolean)) return { rejected: "Fill in a whole new word before checking." };
    const right = full.filter((x, i) => x && x === p.clue.words[i].word).length;
    const wrongWords = full.filter((x, i) => x && x !== p.clue.words[i].word).length;
    const total = before.size + right;
    const row: GuessRow = {
      id: parts.join("|"), name: `${total} / ${p.clue.words.length} words`, icon: null,
      sub: wrongWords ? `${wrongWords} wrong` : `${right} new`, correct: total === p.clue.words.length,
    };
    return { row, wrong: wrongWords > 0 };
  },
  solved: (p, rows) => solvedWords(p.clue.words, rows).size === p.clue.words.length,
  // Each solved word counts; every wrong check costs 10. A full grid is worth at least 10.
  souls: (p, r) => {
    const solved = solvedWords(p.clue.words, r.rows).size;
    const base = Math.round((100 * solved) / p.clue.words.length) - 10 * r.wrong;
    return r.won ? Math.max(10, base) : Math.max(0, base);
  },
  displayed: (p) => p.clue.words.map((w) => w.clue),
};
