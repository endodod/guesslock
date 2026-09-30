// Raw deadlock-api data -> MatchTimeline. Pure: the pipeline and the tests feed it the same shapes.
// Metadata: GET /v1/matches/{id}/metadata. Replay rows: the three demo queries in replay.ts.
import { teamOf, type MatchTimeline, type RiftEpisode, type Series, type Team, type TimelinePlayer } from "./types";

// ───────────── raw shapes (only the fields we read) ─────────────

type RawPath = {
  player_slot: number;
  x_min: number; x_max: number; y_min: number; y_max: number;
  x_pos: number[]; y_pos: number[]; health: number[]; combat_type: number[];
};
type RawPlayer = {
  account_id: number; player_slot: number; team: number; hero_id: number; abandon_match_time_s?: number;
  items: { game_time_s: number; item_id: number; upgrade_id: number; sold_time_s: number }[];
  death_details: { game_time_s: number; killer_player_slot: number; death_pos: { x: number; y: number }; death_duration_s: number }[];
  player_rank_data?: { initial_display_rank?: number | null } | null;
};
export type RawMetadata = {
  match_info: {
    match_id: number; start_time: number; duration_s: number;
    game_mode: number; match_mode: number; not_scored: boolean; low_pri_pool: boolean; new_player_pool: boolean; bot_difficulty: number;
    match_pauses: { game_time_s: number; pause_duration_s: number }[];
    objectives: { team_objective_id: number; team: number; destroyed_time_s: number }[];
    mid_boss: { team_killed: number; team_claimed: number; destroyed_time_s: number }[];
    match_paths: { x_resolution: number; y_resolution: number; paths: RawPath[] };
    players: RawPlayer[];
  };
};
/** Replay rows. Times in *_gametime fields include the pregame (subtract `gst`). */
export type RawReplay = {
  players: { tick: number; steam: number; nw: number; hp: number; maxhp: number; lvl: number; ult: boolean; ult_e: number; respawn: number }[];
  world: { tick: number; gst: number | null; k_team: number | null; k_prog: number[] | null; k_cap: number[] | null }[];
  events: { e: string; tick: number }[];
};

export const STEAM64_BASE = 76561197960265728;
export const TICKS_PER_SECOND = 64;

// ───────────── geometry ─────────────

/** Minimap radius from /v1/assets/map (world units). */
export const MAP_RADIUS = 10752;
/** World -> map-relative [left, top] (0..1). Exact for all 51 neutral camps (see docs/omens-data-spike.md). */
export function toMap(x: number, y: number): [number, number] {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return [r((x + MAP_RADIUS) / (2 * MAP_RADIUS)), r((MAP_RADIUS - y) / (2 * MAP_RADIUS))];
}
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** The midboss pit sits at the map centre (median killer position over 16 kills: (34, -18)). */
export const MIDBOSS_POS = { x: 0, y: 0 };

/** Objective map keys (as in /v1/assets/map objective_positions) for ECitadelTeamObjective ids. */
export function objectiveKey(id: number, lobbyTeam: number): string | null {
  const t = `team${lobbyTeam}`;
  if (id === 0) return `${t}_core`;
  if (id >= 1 && id <= 4) return `${t}_tier1_${id}`;
  if (id >= 5 && id <= 8) return `${t}_tier2_${id - 4}`;
  if (id === 9) return `${t}_titan`;
  return null; // shield generators and base guardians have no map marker
}

// ───────────── helpers ─────────────

function forwardFill(len: number, set: Map<number, number>, initial: number): Series {
  const out: Series = new Array(len);
  let v = initial;
  for (let i = 0; i < len; i++) {
    if (set.has(i)) v = set.get(i)!;
    out[i] = v;
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Centroid of the densest group of a team's living heroes at second t (neighbours within `radius`). */
export function teamCluster(players: TimelinePlayer[], team: Team, t: number, radius = 2000): { x: number; y: number; n: number } | null {
  const alive = players.filter((p) => p.team === team && (p.hp[t] ?? 0) > 0 && p.x[t] !== undefined);
  let best: TimelinePlayer[] = [];
  for (const p of alive) {
    const group = alive.filter((q) => dist(p.x[t], p.y[t], q.x[t], q.y[t]) <= radius);
    if (group.length > best.length) best = group;
  }
  if (!best.length) return null;
  return {
    x: Math.round(best.reduce((a, p) => a + p.x[t], 0) / best.length),
    y: Math.round(best.reduce((a, p) => a + p.y[t], 0) / best.length),
    n: best.length,
  };
}

// ───────────── main ─────────────

export function buildTimeline(meta: RawMetadata, replay: RawReplay): MatchTimeline {
  const m = meta.match_info;
  const len = m.duration_s + 1;
  const res = { x: m.match_paths.x_resolution, y: m.match_paths.y_resolution };
  const paths = new Map(m.match_paths.paths.map((p) => [p.player_slot, p]));
  const gst = replay.world.find((w) => w.gst)?.gst ?? 0;

  const rowsBySteam = new Map<number, RawReplay["players"]>();
  for (const r of replay.players) {
    if (r.tick % TICKS_PER_SECOND !== 0) continue;
    if (!rowsBySteam.has(r.steam)) rowsBySteam.set(r.steam, []);
    rowsBySteam.get(r.steam)!.push(r);
  }

  const players: TimelinePlayer[] = m.players
    .map((pl): TimelinePlayer => {
      const path = paths.get(pl.player_slot);
      const decode = (arr: number[] | undefined, min: number, max: number, r: number) =>
        Array.from({ length: len }, (_, i) => (arr && i < arr.length ? Math.round(min + (arr[i] / r) * (max - min)) : NaN));
      const rows = rowsBySteam.get(pl.account_id + STEAM64_BASE) ?? [];
      const col = (f: (r: RawReplay["players"][number]) => number, init: number) =>
        forwardFill(len, new Map(rows.map((r) => [r.tick / TICKS_PER_SECOND, f(r)])), init);
      return {
        slot: pl.player_slot,
        team: teamOf(pl.team),
        heroId: pl.hero_id,
        accountId: pl.account_id,
        x: decode(path?.x_pos, path?.x_min ?? 0, path?.x_max ?? 0, res.x),
        y: decode(path?.y_pos, path?.y_min ?? 0, path?.y_max ?? 0, res.y),
        combat: Array.from({ length: len }, (_, i) => path?.combat_type[i] ?? 0),
        hp: col((r) => r.hp, 0),
        maxHp: col((r) => r.maxhp, 0),
        netWorth: col((r) => r.nw, 0),
        level: col((r) => r.lvl, 1),
        ultReadyAt: col((r) => (r.ult ? Math.max(0, Math.round((r.ult_e - gst) * 10) / 10) : -1), -1),
        respawnAt: col((r) => (r.respawn > 0 && r.hp <= 0 ? Math.round((r.respawn - gst) * 10) / 10 : 0), 0),
        items: pl.items
          .filter((it) => it.upgrade_id !== 0) // upgrade_id 0 = ability upgrade, not a shop item
          .map((it) => ({ id: it.item_id, t: it.game_time_s, sold: it.sold_time_s })),
        deaths: pl.death_details.map((d) => ({
          t: d.game_time_s, killerSlot: d.killer_player_slot, x: Math.round(d.death_pos.x), y: Math.round(d.death_pos.y), duration: d.death_duration_s,
        })),
      };
    })
    .sort((a, b) => a.slot - b.slot);

  // Midboss: spawns from the replay, kills (with the claiming team) from the metadata.
  const spawns = replay.events.filter((e) => e.e === "mb_spawn").map((e) => Math.round(e.tick / TICKS_PER_SECOND)).sort((a, b) => a - b);
  const kills = [...m.mid_boss]
    .sort((a, b) => a.destroyed_time_s - b.destroyed_time_s)
    .map((k) => ({ t: k.destroyed_time_s, killedBy: teamOf(k.team_killed), claimedBy: teamOf(k.team_claimed) }));
  const alive = spawns.map((s) => ({ spawnAt: s, killedAt: kills.find((k) => k.t >= s)?.t ?? null }));

  return {
    matchId: m.match_id,
    startTime: m.start_time,
    duration: m.duration_s,
    rank: median(m.players.map((p) => p.player_rank_data?.initial_display_rank ?? 0).filter((r) => r > 0)),
    players,
    objectives: m.objectives.map((o) => ({ id: o.team_objective_id, team: teamOf(o.team), destroyedAt: o.destroyed_time_s })),
    midboss: { alive, kills },
    rifts: riftEpisodes(replay.world, players),
    pauses: m.match_pauses.filter((p) => p.pause_duration_s > 0).map((p) => ({ t: p.game_time_s, duration: p.pause_duration_s })),
  };
}

/**
 * Rift ("koth") state machine over the game-rules change rows:
 * scoring team -1 = rift open; 2/3 (in-game Amber/Sapphire) = claimed; back to 0 without a claim = expired.
 */
export function riftEpisodes(world: RawReplay["world"], players: TimelinePlayer[]): RiftEpisode[] {
  const out: RiftEpisode[] = [];
  let open: { openAt: number; best: { team: Team; progress: number; t: number } | null } | null = null;
  let prev: number | null = null;
  for (const w of [...world].sort((a, b) => a.tick - b.tick)) {
    if (w.k_team === null || w.k_team === undefined) continue;
    const t = Math.round(w.tick / TICKS_PER_SECOND);
    if (w.k_team === -1 && prev !== -1) open = { openAt: t, best: null };
    if (open && w.k_team === -1 && w.k_prog) {
      w.k_prog.forEach((p, i) => {
        const team: Team = i === 0 ? "amber" : "sapphire";
        if (p > 0 && (!open!.best || p > open!.best.progress)) open!.best = { team, progress: p, t };
      });
    }
    if (open && prev === -1 && w.k_team !== -1) {
      const claimedBy: Team | null = w.k_team === 2 ? "amber" : w.k_team === 3 ? "sapphire" : null;
      const who = claimedBy ? { team: claimedBy, t } : open.best;
      const c = who ? teamCluster(players, who.team, Math.min(who.t, players[0]?.x.length - 1)) : null;
      out.push({ openAt: open.openAt, endAt: t, claimedBy, pos: c ? { x: c.x, y: c.y } : null });
      open = null;
    }
    prev = w.k_team;
  }
  return out;
}
