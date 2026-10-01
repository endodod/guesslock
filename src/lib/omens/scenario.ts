// MatchTimeline -> scenarios: candidate moments (detection), the snapshot at T, the reveal window,
// and the true answers. Pure and deterministic (seeded), so tests and the pipeline agree.
import { makeRng } from "../rng";
import { MIDBOSS_POS, dist, objectiveKey, toMap } from "./ingest";
import {
  PREVIEW_SECONDS, TEAMS, type BeastAnswer, type ClashAnswer, type MatchTimeline, type OmenAnswer, type OmenKind,
  type OmenSnapshot, type OmenWindow, type RiftAnswer, type RiftEpisode, type Team, type WindowEvent,
} from "./types";

// Tuning (overridable per call; the admin page stores overrides in OmenConfig).
export type OmenTuning = {
  clashWindow: number; clashLead: [number, number]; clashFightRange: number; clashMinPerTeam: number;
  beastWindow: number; beastLead: [number, number]; beastPitRadius: number; beastMinHeroes: number; beastSkipStart: number;
  riftLead: [number, number]; riftDeathRadius: number;
  skipStart: number; sampleEvery: number; maxNetWorthGap: number;
  /** Share of positive (something happens) Clash/Beast scenarios in pools and daily picks. */
  positiveShare: number;
};
export const DEFAULT_TUNING: OmenTuning = {
  clashWindow: 20, clashLead: [10, 20], clashFightRange: 3000, clashMinPerTeam: 3,
  // Nobody fights the midboss before ~10 min (earliest kill in the spike set: 16:11).
  beastWindow: 60, beastLead: [30, 50], beastPitRadius: 3000, beastMinHeroes: 3, beastSkipStart: 600,
  riftLead: [15, 25], riftDeathRadius: 3000,
  skipStart: 180, sampleEvery: 20, maxNetWorthGap: 0.3,
  positiveShare: 0.6,
};

export type Candidate = {
  omen: OmenKind;
  t: number;
  window: number;
  /** Positive = the thing happens (death / midboss kill / rift claim). */
  positive: boolean;
  quality: number; // 0..1, higher = more readable
  /** Map focus point (world coordinates) for the "focus on action" button and quality scoring. */
  focus: { x: number; y: number };
};

// ───────────── shared checks ─────────────

const allDeaths = (tl: MatchTimeline) =>
  tl.players.flatMap((p) => p.deaths.map((d) => ({ ...d, slot: p.slot, team: p.team }))).sort((a, b) => a.t - b.t);

/** Every hero has path data for [from, to] and no pause falls inside it. */
export function windowUsable(tl: MatchTimeline, from: number, to: number): boolean {
  if (from < 0 || to > tl.duration) return false;
  if (tl.pauses.some((p) => p.t >= from && p.t <= to)) return false;
  return tl.players.length === 12 && tl.players.every((p) => {
    for (let s = from; s <= to; s++) if (!Number.isFinite(p.x[s]) || !Number.isFinite(p.y[s]) || !(p.maxHp[s] > 0)) return false;
    return true;
  });
}

const teamNetWorth = (tl: MatchTimeline, team: Team, t: number) =>
  tl.players.filter((p) => p.team === team).reduce((a, p) => a + (p.netWorth[t] ?? 0), 0);

/** Readability: heroes near the action, nobody about to respawn, no stomp. */
export function quality(tl: MatchTimeline, t: number, focus: { x: number; y: number }, tuning = DEFAULT_TUNING): number {
  const near = tl.players.filter((p) => dist(p.x[t], p.y[t], focus.x, focus.y) <= 4500).length;
  const aboutToRespawn = tl.players.some((p) => p.respawnAt[t] > 0 && p.respawnAt[t] - t < 3);
  const a = teamNetWorth(tl, "amber", t), s = teamNetWorth(tl, "sapphire", t);
  const gap = Math.abs(a - s) / Math.max(1, Math.max(a, s));
  if (aboutToRespawn || gap > tuning.maxNetWorthGap) return 0;
  return Math.round((Math.min(1, near / 8) * 0.7 + (1 - gap / tuning.maxNetWorthGap) * 0.3) * 1000) / 1000;
}

// ───────────── detection ─────────────

export function detectClash(tl: MatchTimeline, seed: string, tuning = DEFAULT_TUNING): Candidate[] {
  const rng = makeRng(`${seed}|clash|${tl.matchId}`);
  const W = tuning.clashWindow;
  const deaths = allDeaths(tl).filter((d) => d.t >= tuning.skipStart);
  const out: Candidate[] = [];

  // Positive: ≥2 deaths within 15 s of each other, close together, in a fight between both teams.
  for (let i = 0; i < deaths.length; i++) {
    if (i > 0 && deaths[i].t - deaths[i - 1].t <= 15) continue; // start of a cluster only
    const cluster = [deaths[i]];
    for (let j = i + 1; j < deaths.length && deaths[j].t - cluster[cluster.length - 1].t <= 15; j++) cluster.push(deaths[j]);
    const nearFirst = cluster.filter((d) => dist(d.x, d.y, cluster[0].x, cluster[0].y) <= tuning.clashFightRange);
    if (nearFirst.length < 2) continue;
    const killerTeams = new Set(nearFirst.map((d) => tl.players.find((p) => p.slot === d.killerSlot)?.team).filter(Boolean));
    const involved = new Set([...nearFirst.map((d) => d.team), ...killerTeams]);
    if (involved.size < 2) continue;
    const lead = tuning.clashLead[0] + rng.int(tuning.clashLead[1] - tuning.clashLead[0] + 1);
    const t = cluster[0].t - lead;
    if (t < tuning.skipStart || !windowUsable(tl, t - 10, t + W)) continue;
    // The first seconds are shown before the prediction: no other death may happen in them.
    if (deaths.some((d) => d !== cluster[0] && d.t >= t && d.t < t + PREVIEW_SECONDS)) continue;
    const focus = { x: cluster[0].x, y: cluster[0].y };
    out.push({ omen: "clash", t, window: W, positive: true, quality: quality(tl, t, focus, tuning), focus });
  }

  // Negative: both teams brawling (≥3 heroes each within fight range) but no death in [T, T+W].
  for (let t = tuning.skipStart; t + W <= tl.duration; t += tuning.sampleEvery) {
    if (deaths.some((d) => d.t >= t && d.t <= t + W)) continue;
    const c = contested(tl, t, tuning.clashFightRange);
    if (!c || c.amber < tuning.clashMinPerTeam || c.sapphire < tuning.clashMinPerTeam) continue;
    if (!windowUsable(tl, t - 10, t + W)) continue;
    out.push({ omen: "clash", t, window: W, positive: false, quality: quality(tl, t, c.focus, tuning), focus: c.focus });
  }
  return out;
}

/** Largest group of living heroes (both teams) around any hero: per-team counts and centre. */
function contested(tl: MatchTimeline, t: number, range: number) {
  const alive = tl.players.filter((p) => (p.hp[t] ?? 0) > 0);
  let best: { amber: number; sapphire: number; focus: { x: number; y: number } } | null = null;
  for (const p of alive) {
    const g = alive.filter((q) => dist(p.x[t], p.y[t], q.x[t], q.y[t]) <= range);
    const amber = g.filter((q) => q.team === "amber").length, sapphire = g.length - amber;
    if (!best || Math.min(amber, sapphire) > Math.min(best.amber, best.sapphire)) {
      best = { amber, sapphire, focus: { x: Math.round(g.reduce((a, q) => a + q.x[t], 0) / g.length), y: Math.round(g.reduce((a, q) => a + q.y[t], 0) / g.length) } };
    }
  }
  return best;
}

const midbossAliveAt = (tl: MatchTimeline, t: number) =>
  tl.midboss.alive.some((a) => a.spawnAt <= t && (a.killedAt === null || a.killedAt > t));

export function detectBeast(tl: MatchTimeline, seed: string, tuning = DEFAULT_TUNING): Candidate[] {
  const rng = makeRng(`${seed}|beast|${tl.matchId}`);
  const W = tuning.beastWindow;
  const out: Candidate[] = [];
  // Positive: every midboss kill, seen 30-50 s before it falls.
  for (const k of tl.midboss.kills) {
    const lead = tuning.beastLead[0] + rng.int(tuning.beastLead[1] - tuning.beastLead[0] + 1);
    const t = k.t - lead;
    if (t < tuning.beastSkipStart || !midbossAliveAt(tl, t) || !windowUsable(tl, t - 10, t + W)) continue;
    out.push({ omen: "beast", t, window: W, positive: true, quality: quality(tl, t, MIDBOSS_POS, tuning), focus: MIDBOSS_POS });
  }
  // Only scenarios where the midboss falls: the questions are who kills it and who gets how many rejuvs.
  return out;
}

export function detectRift(tl: MatchTimeline, seed: string, tuning = DEFAULT_TUNING): Candidate[] {
  const rng = makeRng(`${seed}|rift|${tl.matchId}`);
  const out: Candidate[] = [];
  for (const r of tl.rifts) {
    const lead = tuning.riftLead[0] + rng.int(tuning.riftLead[1] - tuning.riftLead[0] + 1);
    const t = r.openAt - lead;
    const window = r.endAt + 3 - t;
    // The rift position is shown from the start, so it needs one (a rift nobody touched has none).
    if (!r.pos || t < tuning.skipStart || !windowUsable(tl, t - 10, t + window)) continue;
    const focus = r.pos;
    out.push({ omen: "rift", t, window, positive: r.claimedBy !== null, quality: quality(tl, t, focus, tuning), focus });
  }
  return out;
}

export function detect(omen: OmenKind, tl: MatchTimeline, seed: string, tuning = DEFAULT_TUNING): Candidate[] {
  return omen === "clash" ? detectClash(tl, seed, tuning) : omen === "beast" ? detectBeast(tl, seed, tuning) : detectRift(tl, seed, tuning);
}

/**
 * Pick candidates so roughly `positiveShare` of them are positive (Clash/Beast target 60/40; the Rift
 * needs no mix since "nobody" is a real outcome). Best quality first within each side.
 */
export function mixPool(cands: Candidate[], count: number, seed: string, positiveShare = 0.6): Candidate[] {
  const rng = makeRng(`${seed}|mix`);
  const byQ = (a: Candidate, b: Candidate) => b.quality - a.quality || a.t - b.t;
  const pos = cands.filter((c) => c.positive && c.quality > 0).sort(byQ);
  const neg = cands.filter((c) => !c.positive && c.quality > 0).sort(byQ);
  const out: Candidate[] = [];
  while (out.length < count && (pos.length || neg.length)) {
    const wantPos = rng.next() < positiveShare;
    out.push((wantPos ? pos.shift() : neg.shift()) ?? (pos.shift() ?? neg.shift())!);
  }
  return out;
}

// ───────────── snapshot, window, answers ─────────────

export function riftAt(tl: MatchTimeline, c: Candidate): RiftEpisode | undefined {
  return tl.rifts.find((r) => r.openAt > c.t && r.openAt <= c.t + c.window);
}

export function buildSnapshot(tl: MatchTimeline, c: Candidate): OmenSnapshot {
  const t = c.t;
  const heroes = tl.players.map((p, key) => {
    const alive = (p.hp[t] ?? 0) > 0;
    return {
      key, team: p.team, heroId: p.heroId,
      pos: toMap(p.x[t], p.y[t]),
      trail: [5, 4, 3, 2, 1].map((d) => toMap(p.x[Math.max(0, t - d)], p.y[Math.max(0, t - d)])),
      hp: alive ? p.hp[t] : 0,
      maxHp: p.maxHp[t],
      alive,
      respawnIn: alive ? 0 : Math.max(0, Math.round((p.respawnAt[t] || t) - t)),
      level: p.level[t],
      netWorth: p.netWorth[t],
      items: p.items.filter((it) => it.t <= t && (it.sold === 0 || it.sold > t)).map((it) => it.id),
      ultIn: p.ultReadyAt[t] < 0 ? null : Math.max(0, Math.round(p.ultReadyAt[t] - t)),
    };
  });
  const claimed = (team: Team) => tl.midboss.kills.filter((k) => k.t <= t && k.claimedBy === team);
  const teams = Object.fromEntries(TEAMS.map((team) => [team, {
    netWorth: teamNetWorth(tl, team, t),
    rejuvs: claimed(team).length,
    // The rejuv buff lasts 180 s after the claim (generic-data rejuv_params).
    rejuvActive: claimed(team).some((k) => t - k.t < 180),
  }])) as OmenSnapshot["teams"];
  const lastKill = [...tl.midboss.kills].reverse().find((k) => k.t <= t) ?? null;
  const nextSpawn = tl.midboss.alive.find((a) => a.spawnAt > t)?.spawnAt ?? null;
  const rift = c.omen === "rift" ? riftAt(tl, c) : undefined;
  return {
    omen: c.omen, t, window: c.window, heroes, teams,
    objectives: tl.objectives
      .map((o) => ({ key: objectiveKey(o.id, o.team === "amber" ? 0 : 1), team: o.team, alive: o.destroyedAt === 0 || o.destroyedAt > t }))
      .filter((o): o is { key: string; team: Team; alive: boolean } => o.key !== null),
    midboss: {
      alive: midbossAliveAt(tl, t),
      killedAt: lastKill && !midbossAliveAt(tl, t) ? lastKill.t : null,
      // Only show a spawn timer the game itself would display (next spawn within the window).
      spawnsIn: !midbossAliveAt(tl, t) && nextSpawn !== null && nextSpawn - t <= c.window ? nextSpawn - t : null,
    },
    rift: rift ? { opensIn: rift.openAt - t, ...(rift.pos ? { pos: toMap(rift.pos.x, rift.pos.y) } : {}) } : null,
  };
}

export function buildWindow(tl: MatchTimeline, c: Candidate): OmenWindow {
  const from = c.t, to = c.t + c.window;
  const events: WindowEvent[] = [];
  const keyOf = (slot: number) => tl.players.findIndex((p) => p.slot === slot);
  for (const d of allDeaths(tl)) {
    if (d.t < from || d.t > to) continue;
    const killer = keyOf(d.killerSlot);
    events.push({ t: d.t, type: "death", key: keyOf(d.slot), killer: killer >= 0 && d.killerSlot !== d.slot ? killer : null, pos: toMap(d.x, d.y) });
  }
  for (const k of tl.midboss.kills) if (k.t >= from && k.t <= to) events.push({ t: k.t, type: "midboss", killedBy: k.killedBy, claimedBy: k.claimedBy });
  for (const o of tl.objectives) {
    const key = objectiveKey(o.id, o.team === "amber" ? 0 : 1);
    if (key && o.destroyedAt >= from && o.destroyedAt <= to) events.push({ t: o.destroyedAt, type: "objective", key, team: o.team });
  }
  const rift = c.omen === "rift" ? riftAt(tl, c) : undefined;
  if (rift) {
    events.push({ t: rift.openAt, type: "rift-open" });
    events.push(rift.claimedBy ? { t: rift.endAt, type: "rift-claim", team: rift.claimedBy } : { t: rift.endAt, type: "rift-expire" });
  }
  events.sort((a, b) => a.t - b.t);
  return {
    tracks: tl.players.map((p, key) => ({
      key,
      pos: Array.from({ length: to - from + 1 }, (_, i) => toMap(p.x[from + i], p.y[from + i])),
      hp: Array.from({ length: to - from + 1 }, (_, i) => p.hp[from + i]),
      maxHp: Array.from({ length: to - from + 1 }, (_, i) => p.maxHp[from + i]),
    })),
    events,
    riftPos: rift?.pos ? toMap(rift.pos.x, rift.pos.y) : null,
  };
}

export function buildAnswer(tl: MatchTimeline, c: Candidate): OmenAnswer {
  const from = c.t, to = c.t + c.window;
  const keyOf = (slot: number) => tl.players.findIndex((p) => p.slot === slot);
  const inWindow = allDeaths(tl).filter((d) => d.t >= from && d.t <= to);
  const count = (ds: typeof inWindow) => ({ amber: ds.filter((d) => d.team === "amber").length, sapphire: ds.filter((d) => d.team === "sapphire").length });

  if (c.omen === "clash") {
    const a: ClashAnswer = { anyDeath: inWindow.length > 0, deaths: count(inWindow), died: [...new Set(inWindow.map((d) => keyOf(d.slot)))].sort((x, y) => x - y) };
    return a;
  }
  if (c.omen === "beast") {
    const kill = tl.midboss.kills.find((k) => k.t >= from && k.t <= to);
    const rejuvs = (team: Team) => tl.midboss.kills.filter((k) => k.t <= to && k.claimedBy === team).length;
    const a: BeastAnswer = { killed: !!kill, killer: kill?.killedBy ?? null, claimer: kill?.claimedBy ?? null, rejuvs: { amber: rejuvs("amber"), sapphire: rejuvs("sapphire") } };
    return a;
  }
  const rift = riftAt(tl, c);
  // Deaths "at the rift": within the radius of the rift while it is open. Untouched rift = no fight there.
  const atRift = rift?.pos
    ? inWindow.filter((d) => d.t >= rift.openAt && d.t <= rift.endAt && dist(d.x, d.y, rift.pos!.x, rift.pos!.y) <= DEFAULT_TUNING.riftDeathRadius)
    : [];
  const a: RiftAnswer = { claimer: rift?.claimedBy ?? "none", deaths: count(atRift) };
  return a;
}

/** Leak check: the snapshot may only describe the state at T. */
export function snapshotLeaks(snapshot: OmenSnapshot, tl: MatchTimeline): string[] {
  const json = JSON.stringify(snapshot);
  const leaks: string[] = [];
  if (json.includes(String(tl.matchId))) leaks.push("match id");
  for (const p of tl.players) if (json.includes(String(p.accountId)) && String(p.accountId).length > 4) leaks.push(`account ${p.slot}`);
  if (/"(name|account|steam|matchId|winner|score)"/i.test(json)) leaks.push("forbidden field");
  return leaks;
}
