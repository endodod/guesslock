// Omen pipeline: discover recent high-rank matches with replays, run the replay queries (rate
// limited), build timelines and scenarios, and pick each day's Omen. Runs inside the daily cron jobs
// (and from the admin page / `npm run omens:harvest`); every step resumes where the last run stopped.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "../db";
import { config } from "../config";
import { fetchJson } from "../deadlock/api";
import { makeRng } from "../rng";
import type { Prisma } from "@/generated/prisma/client";
import { buildTimeline, type RawMetadata } from "./ingest";
import { collectReplay, pollReplayQuery, submitReplayQuery, type JobRef, type ReplayQueryName } from "./replay";
import { DEFAULT_TUNING, buildAnswer, buildSnapshot, buildWindow, detect, mixPool, type OmenTuning } from "./scenario";
import type { MatchTimeline, OmenKind, OmenPayload } from "./types";

export const OMENS: OmenKind[] = ["clash", "beast", "rift"];
const QUERY_NAMES: ReplayQueryName[] = ["players", "world", "events"];
type Jobs = Record<ReplayQueryName, JobRef>;

export const rankBucket = (rank: number) => (rank >= 100 ? "high" : rank >= 60 ? "mid" : "low");

export async function loadTuning(): Promise<OmenTuning> {
  const row = await db.omenConfig.findUnique({ where: { key: "tuning" } });
  return { ...DEFAULT_TUNING, ...((row?.value as Partial<OmenTuning>) ?? {}) };
}

export function packTimeline(tl: MatchTimeline): Buffer {
  return gzipSync(JSON.stringify(tl), { level: 9 });
}
export function unpackTimeline(buf: Uint8Array): MatchTimeline {
  return JSON.parse(gunzipSync(buf).toString("utf8")) as MatchTimeline;
}

// ───────────── match quality filter (prompt §5) ─────────────

export function matchRejection(meta: RawMetadata): string | null {
  const m = meta.match_info;
  if (m.game_mode !== 1) return "not normal mode";
  if (m.not_scored) return "not scored";
  if (m.low_pri_pool || m.new_player_pool) return "low-priority or new-player pool";
  if (m.bot_difficulty) return "bots";
  if (m.players.length !== 12) return "not 12 players";
  if (m.players.some((p) => (p.abandon_match_time_s ?? 0) > 0)) return "abandon";
  return null;
}

// ───────────── discovery ─────────────

type Summary = { match_id: number; start_time: number | string };

/** Queue recent matches that have a replay. `badge` = [min, max] average badge. */
export async function discover(opts: { source: "daily"; badge: [number, number]; hours: number; limit: number; max?: number }): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({
    include_info: "true", game_mode: "normal", is_low_pri_pool: "false", is_new_player_pool: "false",
    min_average_badge: String(opts.badge[0]), max_average_badge: String(opts.badge[1]),
    min_unix_timestamp: String(now - opts.hours * 3600), min_duration_s: "1200",
    order_by: "match_id", order_direction: "desc", limit: String(opts.limit),
  });
  const list = (await fetchJson(`/v1/matches/metadata?${q}`, { timeoutMs: 60000 })) as Summary[];
  const known = new Set((await db.omenMatch.findMany({ where: { matchId: { in: list.map((m) => BigInt(m.match_id)) } }, select: { matchId: true } })).map((m) => Number(m.matchId)));
  let added = 0;
  for (const m of list) {
    if (opts.max !== undefined && added >= opts.max) break;
    if (known.has(m.match_id)) continue;
    const salts = (await fetchJson(`/v1/matches/${m.match_id}/salts?disable_steam=true`).catch(() => null)) as { replay_salt?: number | null } | null;
    if (!salts?.replay_salt) continue; // no replay: exact values impossible
    await db.omenMatch.create({ data: { matchId: BigInt(m.match_id), status: "queued", source: opts.source, priority: opts.source === "daily" ? 10 : 0 } });
    added++;
  }
  return added;
}

// ───────────── processing ─────────────

/** Replay queries submitted in the last hour (the rate budget). */
export async function queriesLastHour(): Promise<number> {
  const n = await db.omenMatch.count({ where: { submittedAt: { gte: new Date(Date.now() - 3600_000) } } });
  return n * QUERY_NAMES.length;
}

/** Submit queries for queued matches, poll running ones, and turn finished ones into timelines + scenarios. */
export async function processQueue(deadline: number, log: (s: string) => void = () => {}): Promise<{ submitted: number; ready: number; failed: number }> {
  const stats = { submitted: 0, ready: 0, failed: 0 };
  const tuning = await loadTuning();
  while (Date.now() < deadline) {
    let progressed = false;

    // Submit while the hourly budget allows.
    let budget = config.omenQueriesPerHour - (await queriesLastHour());
    const queued = await db.omenMatch.findMany({ where: { status: "queued" }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 10 });
    for (const m of queued) {
      if (budget < QUERY_NAMES.length) break;
      try {
        const jobs = {} as Jobs;
        for (const name of QUERY_NAMES) jobs[name] = await submitReplayQuery(Number(m.matchId), name);
        await db.omenMatch.update({ where: { matchId: m.matchId }, data: { status: "fetching", jobs: jobs as unknown as Prisma.InputJsonValue, submittedAt: new Date() } });
        budget -= QUERY_NAMES.length;
        stats.submitted++;
        progressed = true;
      } catch (e) {
        const err = e as Error & { noReplay?: boolean; rateLimited?: boolean };
        if (err.rateLimited) { budget = 0; break; }
        await db.omenMatch.update({ where: { matchId: m.matchId }, data: { status: err.noReplay ? "rejected" : "failed", error: err.message } });
        stats.failed++;
      }
    }

    // Poll and finish.
    const fetching = await db.omenMatch.findMany({ where: { status: "fetching" }, take: 20 });
    for (const m of fetching) {
      try {
        const jobs = m.jobs as unknown as Jobs;
        for (const name of QUERY_NAMES) if (jobs[name].status !== "done") jobs[name] = await pollReplayQuery(jobs[name]);
        const failed = QUERY_NAMES.find((n) => jobs[n].status === "failed");
        if (failed) throw new Error(`replay query ${failed} failed: ${jobs[failed].error ?? ""}`);
        if (!QUERY_NAMES.every((n) => jobs[n].status === "done")) {
          await db.omenMatch.update({ where: { matchId: m.matchId }, data: { jobs: jobs as unknown as Prisma.InputJsonValue } });
          continue;
        }
        const meta = (await fetchJson(`/v1/matches/${m.matchId}/metadata?disable_steam=true`, { timeoutMs: 90000 })) as RawMetadata;
        const reject = matchRejection(meta);
        if (reject) {
          await db.omenMatch.update({ where: { matchId: m.matchId }, data: { status: "rejected", error: reject, jobs: jobs as unknown as Prisma.InputJsonValue } });
          continue;
        }
        const tl = buildTimeline(meta, await collectReplay(jobs));
        await db.omenMatch.update({
          where: { matchId: m.matchId },
          data: { status: "ready", rank: tl.rank, startTime: new Date(tl.startTime * 1000), timelineGz: new Uint8Array(packTimeline(tl)), jobs: jobs as unknown as Prisma.InputJsonValue, error: null },
        });
        const made = await createScenarios(tl, tuning);
        log(`match ${m.matchId}: ${made} scenarios`);
        stats.ready++;
        progressed = true;
      } catch (e) {
        await db.omenMatch.update({ where: { matchId: m.matchId }, data: { status: "failed", error: (e as Error).message } });
        stats.failed++;
      }
    }

    const pending = await db.omenMatch.count({ where: { status: { in: ["queued", "fetching"] } } });
    if (!pending) break;
    if (!progressed) {
      const outOfBudget = (await db.omenMatch.count({ where: { status: "fetching" } })) === 0;
      if (outOfBudget) break; // only queued matches left and no budget: next run
      await new Promise((r) => setTimeout(r, 10_000)); // jobs take about a minute
    }
  }
  return stats;
}

/**
 * Detect moments in a timeline and store one scenario per Omen: the best of a seeded
 * positive/negative pick (an endless mode may use more of each match later).
 */
export async function createScenarios(tl: MatchTimeline, tuning: OmenTuning = DEFAULT_TUNING): Promise<number> {
  let made = 0;
  for (const omen of OMENS) {
    const cands = detect(omen, tl, String(tl.matchId), tuning).filter((c) => c.quality > 0);
    // Rift outcomes need no artificial mix ("nobody" is a real answer).
    const count = 1;
    const picked = omen === "rift" ? [...cands].sort((a, b) => b.quality - a.quality).slice(0, count) : mixPool(cands, count, `${tl.matchId}|${omen}`, tuning.positiveShare);
    for (const c of picked) {
      const id = `${tl.matchId}-${omen}-${c.t}`;
      const payload: OmenPayload = {
        v: 1, mode: "omen", omen, scenarioId: id, matchId: tl.matchId,
        snapshot: buildSnapshot(tl, c), window: buildWindow(tl, c), answer: buildAnswer(tl, c),
      };
      const scenarioSource = "daily";
      await db.scenario.upsert({
        where: { id },
        create: {
          id, omen, matchId: BigInt(tl.matchId), t: c.t, window: c.window, positive: c.positive, quality: c.quality,
          source: scenarioSource, rank: tl.rank, patch: new Date(tl.startTime * 1000).toISOString().slice(0, 10),
          payload: payload as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
      made++;
    }
  }
  return made;
}

/** Drop old compressed timelines (scenarios keep their own frozen payload). */
export async function pruneTimelines(): Promise<number> {
  const r = await db.omenMatch.updateMany({
    where: { timelineGz: { not: null }, updatedAt: { lt: new Date(Date.now() - config.omenTimelineDays * 86400_000) } },
    data: { timelineGz: null },
  });
  return r.count;
}

/**
 * Matches still needed so every Omen has a scenario for each of `days` (the days being generated
 * that don't have their Omen yet). Each harvested match yields at most one scenario per Omen.
 */
export async function omenShortfall(days: string[]): Promise<number> {
  let need = 0;
  for (const omen of OMENS) {
    const have = await db.dailyPuzzle.count({ where: { mode: omen, date: { in: days }, sealed: false } });
    const stock = await db.scenario.count({ where: { omen, source: "daily", status: { in: ["candidate", "approved"] }, dailyDate: null } });
    need = Math.max(need, days.length - have - stock);
  }
  return Math.max(0, need);
}

/**
 * One harvest pass: queue just enough recent high-rank matches (with a replay) for the days that
 * still lack an Omen, then process the queue until `deadline`. Nothing is queued when stocked.
 */
export async function harvest(deadline: number, log: (s: string) => void = () => {}, days?: string[]) {
  const out: Record<string, number | string> = {};
  try {
    const need = days ? await omenShortfall(days) : 1;
    const inFlight = await db.omenMatch.count({ where: { source: "daily", status: { in: ["queued", "fetching"] } } });
    // Rifts don't happen in every scenario window: queue one spare match.
    const toQueue = need > 0 ? need + 1 - inFlight : 0;
    out.needed = need;
    if (toQueue > 0) out.queued = await discover({ source: "daily", badge: [100, 200], hours: 36, limit: 30, max: toQueue });
  } catch (e) {
    out.discoverError = (e as Error).message;
  }
  Object.assign(out, await processQueue(deadline, log));
  out.pruned = await pruneTimelines();
  return out;
}

// ───────────── bundled seed (fallback stock) ─────────────

export const SEED_FILE = path.join(process.cwd(), "data", "omens-seed.json.gz");

export type SeedScenario = {
  id: string; omen: OmenKind; matchId: number; t: number; window: number; positive: boolean;
  quality: number; rank: number; patch: string | null; payload: OmenPayload;
};

/**
 * Import the bundled seed scenarios for an Omen that has no stock (fresh install, a harvest that
 * came up short, or an API outage). Scenarios already in the DB (used or not) are skipped.
 */
export async function importSeed(omen: OmenKind): Promise<number> {
  if (!existsSync(SEED_FILE)) return 0;
  const seed = (JSON.parse(gunzipSync(readFileSync(SEED_FILE)).toString("utf8")) as SeedScenario[]).filter((s) => s.omen === omen);
  const have = new Set((await db.scenario.findMany({ where: { id: { in: seed.map((s) => s.id) } }, select: { id: true } })).map((s) => s.id));
  let added = 0;
  for (const s of seed) {
    if (have.has(s.id)) continue;
    await db.omenMatch.upsert({
      where: { matchId: BigInt(s.matchId) },
      create: { matchId: BigInt(s.matchId), status: "ready", source: "seed", rank: s.rank },
      update: {},
    });
    await db.scenario.create({
      data: {
        id: s.id, omen: s.omen, matchId: BigInt(s.matchId), t: s.t, window: s.window, positive: s.positive, quality: s.quality,
        source: "daily", rank: s.rank, patch: s.patch, payload: s.payload as unknown as Prisma.InputJsonValue,
      },
    });
    added++;
  }
  return added;
}

// ───────────── daily assignment ─────────────

/**
 * The Omen for `date`: an admin-approved pick for that day, else the best unused daily candidate.
 * Clash and Beast keep the ~60/40 positive/negative mix per day (seeded), so "yes" isn't always right.
 */
export async function assignOmen(omen: OmenKind, date: string, seed: string, exclude: string[] = []): Promise<{ id: string; payload: OmenPayload } | null> {
  const pinned = await db.scenario.findFirst({ where: { omen, dailyDate: date, status: "approved", id: { notIn: exclude } } });
  let pick = pinned;
  if (!pick) {
    const where = { omen, source: "daily", status: { in: ["candidate", "approved"] }, dailyDate: null, id: { notIn: exclude } };
    const orderBy = [{ quality: "desc" as const }, { createdAt: "desc" as const }];
    let pool = await db.scenario.findMany({ where, orderBy, take: 200 });
    // No harvested stock: fall back to the bundled seed so the day still gets its Omen.
    if (!pool.length && (await importSeed(omen)) > 0) pool = await db.scenario.findMany({ where, orderBy, take: 200 });
    if (!pool.length) return null;
    // The Beast is always a kill; a Rift needs a known position (it is shown from the start).
    const wantPositive = omen === "rift" ? null : omen === "beast" ? true : makeRng(`${seed}|side`).next() < (await loadTuning()).positiveShare;
    const usable = (s: (typeof pool)[number]) => omen === "beast" ? s.positive : omen !== "rift" || !!(s.payload as unknown as OmenPayload).window.riftPos;
    const ranked = [...pool].filter(usable).sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved"));
    if (!ranked.length) return null;
    pick = ranked.find((s) => wantPositive === null || s.positive === wantPositive) ?? ranked[0];
  }
  await db.scenario.update({ where: { id: pick.id }, data: { status: "used", dailyDate: date } });
  return { id: pick.id, payload: pick.payload as unknown as OmenPayload };
}
