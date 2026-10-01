// The Séance: shared types (server and client; no server imports here).
import type { SeanceEntity, SeanceTable } from "@/locks.config";

/** Heroes: mechanics, visuals, lore. Items: stats, effects, visuals. Abilities: mechanics, effects, visuals. */
export type CategoryType = "mechanics" | "visuals" | "lore" | "stats" | "effects";
export const CATEGORY_TYPES: CategoryType[] = ["mechanics", "visuals", "lore", "stats", "effects"];
export const ENTITY_TYPES: Record<SeanceEntity, CategoryType[]> = {
  hero: ["mechanics", "visuals", "lore"],
  item: ["stats", "effects", "visuals"],
  ability: ["mechanics", "effects", "visuals"],
};
export type CategorySource = "api" | "derived" | "curated";
export type CategoryStatus = "draft" | "approved" | "retired";

/** A category as the board generator sees it: approved and complete, members = heroes with "yes". */
export type LibraryCategory = {
  id: number;
  type: CategoryType;
  label: string;
  explanation: string | null;
  difficulty: number; // 1..4
  members: number[];
};

/** Difficulty rank of a group on its board: 1 = easiest (brass) … 4 = hardest (cursed). */
export type Rank = 1 | 2 | 3 | 4;

/** One tile: a hero, an item or an ability (`sub` = the hero an ability belongs to, kept for the admin only). */
export type SeanceHero = { id: number; name: string; image: string | null; sub?: string };

export type SeanceGroup = {
  categoryId: number;
  label: string;
  explanation: string | null;
  difficulty: number;
  rank: Rank;
  /** The four heroes of this group on the board (the unique solution). */
  members: number[];
};

/** DailyPuzzle.payload of a Séance table. Everything a table displays and checks is frozen here. */
export type SeancePayload = {
  v: 1;
  mode: "seance";
  /** What the 16 tiles are. Missing in boards frozen before the Bazaar and the Grimoire: heroes. */
  entity?: SeanceEntity;
  table: SeanceTable;
  /** Phase 2 (community boards) keeps the same shape; daily boards come from the category library. */
  source: "daily" | "community";
  authorUserId?: string;
  /** The 16 heroes in their seeded display order. */
  heroes: SeanceHero[];
  /** Sorted by rank (easiest first). Secret until solved. */
  groups: SeanceGroup[];
  redHerrings: number;
};

export type SubmissionResult = "correct" | "one-away" | "wrong";

/** A solved (or, once the table is finished, revealed) group as sent to the browser. */
export type GroupView = {
  rank: Rank;
  label: string;
  explanation: string | null;
  members: SeanceHero[];
  /** Found by the player (false = revealed after a loss). */
  found: boolean;
};

export type SeanceView = {
  slug: string;
  date: string;
  number: number;
  table: SeanceTable;
  status: "playing" | "won" | "lost" | "sealed";
  sealedReason?: string;
  /** All 16 heroes in display order (the client hides the ones in solved bands). */
  heroes: SeanceHero[];
  /** Groups found so far, in the order they were found. When finished, every group (found first, then the rest by rank). */
  groups: GroupView[];
  /** Every accepted submission, oldest first. Never says which group a wrong pick belongs to. */
  history: { ids: number[]; result: SubmissionResult }[];
  mistakes: number;
  maxMistakes: number;
  /** "Reveal a category name": offered after 2 mistakes. */
  hint: { after: number; available: boolean; used: boolean; label?: string };
  hintsUsed: number;
  /** Only once the table is finished: each submission's true group ranks, for the share grid. */
  share?: Rank[][];
  souls?: number;
};

/** Stored per submission in Play.guesses / LockRecord.g: "id,id,id,id", or HINT_ENTRY. */
export const HINT_ENTRY = "hint";

/** The category types a table draws from: its own type, or all three of the entity's types for "mixed". */
export function tableTypes(entity: SeanceEntity, table: SeanceTable): CategoryType[] {
  return table === "mixed" ? ENTITY_TYPES[entity] : [table as CategoryType];
}
