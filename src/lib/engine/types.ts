// View types shared by server (play evaluation) and client (rendering). No server imports here.

export type TileResult = "match" | "partial" | "miss";
export type Arrow = "up" | "down";

export type Tile = { key: string; display: string; result: TileResult; arrow?: Arrow };

export type GuessRow = {
  id: string;
  name: string;
  icon: string | null;
  sub?: string; // e.g. hero name for abilities
  correct: boolean;
  tiles?: Tile[];
  arrow?: Arrow; // The Measure
  close?: boolean; // The Measure: within tolerance
};

export type HintView = {
  id: string;
  label: string;
  after: number;
  unlocked: boolean;
  value?: string;
  image?: string;
  audio?: string;
  /** Playback gain for `audio` (The Resonance's gun clip). */
  gainDb?: number;
};

/** One playable clip of The Resonance. Labels are neutral ("Sound 1"). */
export type SoundClipView = { url: string; gainDb: number; label: string };

export type ColumnMeta = { key: string; label: string; info: string; numeric?: boolean };

export type Clue =
  | { kind: "grid"; columns: ColumnMeta[] }
  | { kind: "splash"; image: string; zoom: number; originX: number; originY: number }
  | { kind: "sigil"; image: string; grid: number; covered: number[] }
  | { kind: "text"; sections: { label?: string; text: string }[]; total: number; image?: string | null }
  | { kind: "build"; items: { name: string; image: string | null; slot: string }[]; total: number; /** Ability slots (1-4) in the order the points are spent. */ path?: number[] }
  | { kind: "emoji"; slots: (string | null)[] }
  | { kind: "echo"; lines: { text: string; audio?: string | null }[]; total: number; note?: string }
  | { kind: "convo"; lines: { mine: boolean; text: string }[]; /** Bites (a question and its answer) shown / in total. */ shown: number; total: number; other: { name: string; image: string | null } | null }
  | { kind: "sound"; clips: SoundClipView[]; total: number; slot?: number | null }
  | { kind: "relic"; image: string; blur: number }
  | {
      kind: "lineage";
      direction: "into" | "from";
      shown: { name: string; image: string | null; slot: string };
      answerSlot: string;
    }
  | {
      kind: "measure";
      item: { name: string; image: string | null; slot: string };
      stats: { label: string; display: string | null; hidden?: boolean; postfix: string }[];
      hiddenLabel: string;
      postfix: string;
    };

export type AnswerView = {
  id: string;
  name: string;
  image: string | null;
  sub?: string;
  /** Extra reveal content, e.g. all valid Lineage answers, The Measure exact value, Echo lines. */
  extra?: {
    alsoValid?: { name: string; image: string | null }[];
    exactValue?: string;
    lines?: { text: string; audio?: string | null }[];
    hero?: { name: string; image: string | null };
    /** The Colloquy: the hero on the other side of the conversation. */
    partner?: { name: string; image: string | null };
    /** The Resonance, when the lock jammed (there's no bonus round to protect then). */
    ability?: { name: string; image: string | null };
  };
};

export type BonusView = {
  prompt: string;
  options: { id: string; name: string }[];
  picked?: string;
  correct?: boolean;
  answerId?: string;
  /** Shown once the bonus is answered (The Resonance: the ability's name and icon). */
  reveal?: { name: string; image: string | null };
};

export type PlayStatus = "playing" | "won" | "lost" | "sealed";

export type PlayView = {
  slug: string;
  date: string;
  number: number;
  status: PlayStatus;
  sealedReason?: string;
  rows: GuessRow[]; // in guess order (oldest first)
  wrong: number;
  hints: HintView[];
  hintsUsed: number;
  clue: Clue | null;
  answer?: AnswerView;
  bonus?: BonusView;
  maxTries?: number;
  /** The player gave up (unlimited-guess locks): the answer is revealed and the lock jams. */
  gaveUp?: boolean;
};

export type CatalogEntry = {
  id: string;
  name: string;
  icon: string | null;
  group?: string; // hero name for abilities, slot for items
  slot?: string;
  aliases?: string[];
  /** Secondary search text (stat buffs, effects). Matches rank below name matches. */
  keywords?: string;
};

export type Catalog = { hero: CatalogEntry[]; ability: CatalogEntry[]; item: CatalogEntry[] };
