// The Omens: predict what happens next from a frozen moment of a real match.
// Shared by server (ingest, detection, scoring) and client (map, prediction, reveal). No server imports.

export type OmenKind = "clash" | "beast" | "rift";
export type Team = "amber" | "sapphire";
/** Metadata lobby team 0 is Amber (Hidden King, bottom base); 1 is Sapphire (Archmother). See docs/omens-data-spike.md. */
export const TEAMS: readonly Team[] = ["amber", "sapphire"];
export const teamOf = (lobbyTeam: number): Team => (lobbyTeam === 0 ? "amber" : "sapphire");

// ───────────── match timeline (server only; built by ingest.ts from metadata + replay) ─────────────

/** One value per game second; index = second since game start (metadata time = replay tick / 64). */
export type Series = number[];

export type TimelinePlayer = {
  slot: number;
  team: Team;
  heroId: number;
  accountId: number;
  /** World coordinates (rounded) and state per second, from metadata match_paths. */
  x: Series;
  y: Series;
  combat: Series; // ECombatType: 0 out, 1 player, 2 enemy NPC, 3 neutral
  /** Exact values per second, from the replay. */
  hp: Series;
  maxHp: Series;
  netWorth: Series;
  level: Series;
  /** Second at which the ultimate is ready again (<= t means ready); -1 = not trained yet. */
  ultReadyAt: Series;
  /** Second at which a dead hero respawns (0 while alive). */
  respawnAt: Series;
  /** Shop items: bought at `t`, sold (or upgraded away) at `sold` (0 = kept). */
  items: { id: number; t: number; sold: number }[];
  deaths: { t: number; killerSlot: number; x: number; y: number; duration: number }[];
};

export type RiftEpisode = {
  openAt: number;
  /** Second the rift was claimed or expired. */
  endAt: number;
  claimedBy: Team | null;
  /** World position, from the capturing heroes; null when nobody ever touched it. */
  pos: { x: number; y: number } | null;
};

export type MatchTimeline = {
  matchId: number;
  startTime: number; // unix seconds
  duration: number;
  rank: number; // median player badge (tier*10 + subtier)
  players: TimelinePlayer[]; // sorted by slot
  objectives: { id: number; team: Team; destroyedAt: number }[]; // destroyedAt 0 = alive at match end
  midboss: {
    /** Alive intervals [spawnAt, killedAt] (killedAt = duration if never killed). */
    alive: { spawnAt: number; killedAt: number | null }[];
    kills: { t: number; killedBy: Team; claimedBy: Team }[];
  };
  rifts: RiftEpisode[];
  pauses: { t: number; duration: number }[];
};

// ───────────── what the player sees ─────────────

export type SnapshotHero = {
  /** Stable index within the scenario (0-11). Not a player identifier. */
  key: number;
  team: Team;
  heroId: number;
  /** Map-relative position (0..1, left/top) plus the last 5 s trail, oldest first. */
  pos: [number, number];
  trail: [number, number][];
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnIn: number; // seconds, 0 when alive
  level: number;
  netWorth: number;
  items: number[];
  /** Seconds until the ultimate is ready (0 = ready), or null if not trained. */
  ultIn: number | null;
};

export type OmenSnapshot = {
  omen: OmenKind;
  /** Game time at T, in seconds. */
  t: number;
  window: number;
  heroes: SnapshotHero[];
  teams: Record<Team, { netWorth: number; rejuvs: number; rejuvActive: boolean }>;
  /** Objective map keys as in /v1/assets/map objective_positions (e.g. "team0_tier1_1"). */
  objectives: { key: string; team: Team; alive: boolean }[];
  midboss: { alive: boolean; killedAt: number | null; spawnsIn: number | null };
  rift: { opensIn: number } | null;
};

export type WindowEvent =
  | { t: number; type: "death"; key: number; killer: number | null; pos: [number, number] }
  | { t: number; type: "midboss"; killedBy: Team; claimedBy: Team }
  | { t: number; type: "objective"; key: string; team: Team }
  | { t: number; type: "rift-open" }
  | { t: number; type: "rift-claim"; team: Team }
  | { t: number; type: "rift-expire" };

/** Revealed after lock-in: per-second tracks from T to T+W plus the events in that window. */
export type OmenWindow = {
  tracks: { key: number; pos: [number, number][]; hp: number[]; maxHp: number[] }[];
  events: WindowEvent[];
  riftPos: [number, number] | null;
};

export type ClashAnswer = { anyDeath: boolean; deaths: Record<Team, number>; died: number[] };
export type BeastAnswer = { killed: boolean; killer: Team | null; claimer: Team | null; rejuvs: Record<Team, number> };
export type RiftAnswer = { claimer: Team | "none"; deaths: Record<Team, number> };
export type OmenAnswer = ClashAnswer | BeastAnswer | RiftAnswer;

export type QuestionResult = { id: string; label: string; guess: string; actual: string; points: number; max: number };
export type OmenResult = { total: number; questions: QuestionResult[] };

/** Stored in DailyPuzzle.payload (server side). Only `snapshot` is sent before lock-in. */
export type OmenPayload = {
  v: 1;
  mode: "omen";
  omen: OmenKind;
  scenarioId: string;
  matchId: number;
  snapshot: OmenSnapshot;
  window: OmenWindow;
  answer: OmenAnswer;
};
