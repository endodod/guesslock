// The word list of the word locks (The Lexicon, The Crossword): every hero, item and ability name, as plain A–Z letters.
import type { GameData } from "../engine/context";
import { chunkText } from "../engine/modes/hero";
import { CENSOR, findLeaks, redact } from "../text/redact";

/** A clue needs at least this many letters besides its label and blacked-out names. */
const MIN_CLUE_LETTERS = 25;

export type WordKind = "hero" | "item" | "ability";

export type WordEntry = {
  /** Upper-case A–Z, spaces and punctuation dropped ("Grey Talon" -> "GREYTALON"). */
  word: string;
  /** How the game writes it. */
  name: string;
  kind: WordKind;
  id: number;
  image: string | null;
  /** Names that must not appear in this word's clue. */
  terms: string[];
  /** A one-line crossword clue (null when there is no usable text). */
  clue: string | null;
};

/** Letters only, upper case. Null for names with digits or an ampersand ("Mo & Krill" would read as "MOANDKRILL"). */
export function toWord(name: string): string | null {
  if (/[0-9&]/.test(name)) return null;
  const w = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return w || null;
}

/** The first sentence or two of a text, at most `max` characters, cut at a sentence end. */
export function shortClue(text: string, max = 150): string | null {
  const sentences = chunkText(text, Infinity);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > max) break;
    out = (out + " " + s).trim();
  }
  if (!out && sentences[0]) out = sentences[0].length > max ? `${sentences[0].slice(0, max - 1).replace(/\s+\S*$/, "")}…` : sentences[0];
  return out || null;
}

const SLOT_NAME: Record<string, string> = { weapon: "Gun", vitality: "Vitality", spirit: "Spirit" };

/** Every word, one per name (the first entity wins when two share a name). `mode` skips entities excluded from it. */
export function buildCorpus(data: GameData, mode: string): WordEntry[] {
  const out = new Map<string, WordEntry>();
  const add = (e: Omit<WordEntry, "word">) => {
    const word = toWord(e.name);
    if (!word || out.has(word)) return;
    let clue = e.clue;
    // A clue that still names the answer is no clue, and neither is one that is little more than a blacked-out name.
    if (clue && (findLeaks(clue, e.terms).length || clue.replace(/^[^:]*:/, "").replaceAll(CENSOR, "").replace(/[^\p{L}]/gu, "").length < MIN_CLUE_LETTERS)) clue = null;
    out.set(word, { ...e, word, clue });
  };
  for (const h of data.heroes) {
    if (!h.eligible || h.exclude.includes(mode)) continue;
    const lore = data.text("hero_lore", h.id);
    add({ name: h.name, kind: "hero", id: h.id, image: h.icon, terms: [h.name, ...h.aliases], clue: lore ? prefix("Hero", shortClue(lore)) : null });
  }
  for (const i of data.items) {
    if (i.exclude.includes(mode)) continue;
    const terms = [i.name, ...i.aliases];
    const desc = i.src.description ? redact(i.src.description, terms.map((term) => ({ term }))).text : "";
    add({ name: i.name, kind: "item", id: i.id, image: i.image, terms, clue: desc ? prefix(`${SLOT_NAME[i.src.slot] ?? "Shop"} item`, shortClue(desc)) : null });
  }
  for (const a of data.abilities) {
    const hero = data.hero(a.heroId);
    if (!hero || a.exclude.includes(mode)) continue;
    const desc = data.text("ability_desc", a.id);
    add({ name: a.name, kind: "ability", id: a.id, image: a.icon, terms: [a.name, ...a.aliases], clue: desc ? prefix(`${hero.name}'s ability`, shortClue(desc)) : null });
  }
  return [...out.values()];
}

const prefix = (label: string, text: string | null) => (text ? `${label}: ${text}` : null);
