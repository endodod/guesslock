// Daily puzzle generation: one frozen DailyPuzzle row per lock per day.
import { db } from "../db";
import { config } from "../config";
import { LOCKS, type LockDef } from "@/locks.config";
import { makeRng, puzzleSeed } from "../rng";
import { addDays } from "../time";
import { dayIndex, todayDate } from "../day";
import { fetchAbilityOrder, fetchHeroItemStats, type HeroItemStats } from "../deadlock/api";
import { loadGameData, type GameData } from "./context";
import { MODES } from "./registry";
import { SealedError, SkipCandidate, type BasePayload, type Candidate } from "./mode";
import { noRepeatWindow, orderCandidates } from "./select";
import { alert } from "../monitoring";
import { assignOmen, harvest, unpackTimeline } from "../omens/harvest";
import type { MatchTimeline } from "../omens/types";
import { clueImages } from "../image/clue";
import { getMapMeta } from "../omens/map";
import { buildSeanceBoard, loadLibrary } from "../seance/library";
import { boardKey } from "../seance/board";
import type { Prisma } from "@/generated/prisma/client";

export type GenResult = { date: string; slug: string; status: "created" | "exists" | "sealed" | "skipped" | "error"; answerId?: string; note?: string };

export { todayDate, dayIndex };

function memoAnalytics(): () => Promise<HeroItemStats> {
  let p: Promise<HeroItemStats> | null = null;
  return () => (p ??= fetchHeroItemStats());
}

/** Harvested match timelines still on file (The Cache), loaded once per run. */
function memoMatches(): () => Promise<MatchTimeline[]> {
  let p: Promise<MatchTimeline[]> | null = null;
  return () => (p ??= db.omenMatch
    .findMany({ where: { status: "ready", timelineGz: { not: null } }, select: { timelineGz: true }, orderBy: { matchId: "asc" } })
    .then((rows) => rows.flatMap((r) => {
      try { return [unpackTimeline(r.timelineGz!)]; } catch { return []; }
    })));
}
const matchesMemo = { current: memoMatches() };

/** Approved Séance hero groups as Constellation categories. */
async function heroCategories() {
  const lib = await loadLibrary("hero");
  return lib.categories.map((c) => ({ key: String(c.id), label: c.label, info: c.explanation ?? "", members: c.members }));
}

async function latestDataVersion(): Promise<number | null> {
  const run = await db.syncRun.findFirst({ where: { kind: "assets", status: "ok" }, orderBy: { id: "desc" } });
  return run?.clientVersion ?? null;
}

async function recentAnswers(slug: string, date: string, windowDays: number): Promise<string[]> {
  if (windowDays <= 0) return [];
  const rows = await db.dailyPuzzle.findMany({
    where: { mode: slug, sealed: false, date: { gte: addDays(date, -windowDays), lt: date } },
    select: { answerId: true },
  });
  return rows.map((r) => r.answerId);
}

/** The Omens: freeze a harvested scenario (see src/lib/omens/harvest.ts) into the day's puzzle. */
async function buildOmen(lock: LockDef, date: string, exclude: string[] = []): Promise<{ candidate: Candidate; payload: BasePayload } | null> {
  const picked = await assignOmen(lock.slug as "clash" | "beast" | "rift", date, puzzleSeed(date, lock.slug, config.salt), exclude);
  if (!picked) throw new SealedError("no Omen scenario harvested yet");
  return { candidate: { answerId: picked.id, ref: picked.id }, payload: picked.payload as unknown as BasePayload };
}

/** The Séance: a seeded board from the category library (sealed when no valid board exists). */
async function buildSeance(lock: LockDef, date: string): Promise<{ candidate: Candidate; payload: BasePayload }> {
  const r = await buildSeanceBoard(lock, date);
  if (!r.ok) throw new SealedError(r.reason);
  const key = boardKey(r.payload);
  return { candidate: { answerId: key, ref: key }, payload: r.payload as unknown as BasePayload };
}

/** Admin: replace a day's Omen with the next best candidate and reject the old one. */
export async function regenerateOmen(date: string, slug: string): Promise<void> {
  const lock = LOCKS.find((l) => l.slug === slug && l.group === "omens");
  if (!lock) throw new Error("not an Omen");
  const existing = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
  const old = existing && !existing.sealed ? existing.answerId : null;
  if (old) await db.scenario.update({ where: { id: old }, data: { status: "rejected" } }).catch(() => undefined);
  const built = await buildOmen(lock, date, old ? [old] : []);
  const row = { answerId: built!.candidate.answerId, payload: built!.payload as unknown as Prisma.InputJsonValue, sealed: false, sealedReason: null, overridden: true };
  await db.dailyPuzzle.upsert({ where: { date_mode: { date, mode: slug } }, create: { date, mode: slug, ...row }, update: row });
}

/** Build a payload for one lock/day. Returns null when the pool is empty. */
export async function buildPuzzle(
  lock: LockDef, date: string, data: GameData, analytics: () => Promise<HeroItemStats>, forced?: Candidate,
): Promise<{ candidate: Candidate; payload: BasePayload } | null> {
  const impl = MODES[lock.mode];
  const idx = dayIndex(date);
  const seed = puzzleSeed(date, lock.slug, config.salt);
  const pool = impl.candidates(data, { dayIndex: idx });
  let order: Candidate[];
  // Modes that pick their own answer in build() (one candidate) get a window sized by their own default.
  const window = noRepeatWindow(pool.length > 1 ? pool.length : 100, config.maxNoRepeatDays, lock.noRepeatDays);
  const recent = forced ? [] : await recentAnswers(lock.slug, date, window);
  if (forced) order = [forced];
  else order = orderCandidates(pool, recent, seed);
  for (const candidate of order.slice(0, 8)) {
    try {
      const payload = await impl.build(candidate, {
        data, rng: makeRng(`${seed}|build`), date, dayIndex: idx, analytics, abilityOrder: fetchAbilityOrder,
        images: clueImages, matches: matchesMemo.current, heroCategories, recent,
        mapImage: lock.mode === "wayfinder" ? (await getMapMeta().catch(() => null))?.image ?? null : undefined,
      });
      return { candidate: payload.key ? { answerId: payload.key, ref: payload.key } : candidate, payload };
    } catch (e) {
      if (e instanceof SkipCandidate) continue;
      throw e;
    }
  }
  return null;
}

export async function generateDay(
  date: string,
  opts: { data?: GameData; analytics?: () => Promise<HeroItemStats>; slugs?: string[]; force?: boolean } = {},
): Promise<GenResult[]> {
  const data = opts.data ?? (await loadGameData());
  const analytics = opts.analytics ?? memoAnalytics();
  const dataVersion = await latestDataVersion();
  const today = todayDate();
  const results: GenResult[] = [];

  for (const lock of LOCKS) {
    if (opts.slugs && !opts.slugs.includes(lock.slug)) continue;
    const existing = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: lock.slug } } });
    // Never regenerate a day that is live or past unless forced; overrides always stick.
    if (existing && (!opts.force || existing.overridden)) {
      if (!(existing.sealed && date >= today)) {
        results.push({ date, slug: lock.slug, status: "exists", answerId: existing.answerId });
        continue;
      }
    }
    try {
      const built =
        lock.group === "omens" ? await buildOmen(lock, date)
        : !!lock.box ? await buildSeance(lock, date)
        : await buildPuzzle(lock, date, data, analytics);
      if (!built) throw new SealedError("no eligible answers");
      const row = {
        answerId: built.candidate.answerId,
        payload: built.payload as unknown as Prisma.InputJsonValue,
        dataVersion, sealed: false, sealedReason: null,
      };
      await db.dailyPuzzle.upsert({
        where: { date_mode: { date, mode: lock.slug } },
        create: { date, mode: lock.slug, ...row },
        update: row,
      });
      results.push({ date, slug: lock.slug, status: "created", answerId: built.candidate.answerId });
    } catch (e) {
      const reason = (e as Error).message;
      if (e instanceof SealedError) {
        // Only seal days that have started; future days are retried by the next cron run.
        if (date <= today) {
          await db.dailyPuzzle.upsert({
            where: { date_mode: { date, mode: lock.slug } },
            create: { date, mode: lock.slug, answerId: "-", payload: {}, sealed: true, sealedReason: reason, dataVersion },
            update: { sealed: true, sealedReason: reason },
          });
          results.push({ date, slug: lock.slug, status: "sealed", note: reason });
        } else results.push({ date, slug: lock.slug, status: "skipped", note: reason });
      } else {
        console.error(`[generate] ${date} ${lock.slug}`, e);
        results.push({ date, slug: lock.slug, status: "error", note: reason });
      }
    }
  }
  return results;
}

/** Generate today plus N days ahead, in date order (keeps the no-repeat window consistent). */
export async function generateAhead(
  days = config.generateDaysAhead,
  /** The Omen harvest runs first and stops at this time (ms); 0 skips it. Default: 150 s. */
  opts: { harvestUntil?: number } = {},
): Promise<GenResult[]> {
  const run = await db.syncRun.create({ data: { kind: "generate", status: "running" } });
  const start = todayDate();
  // Built-in Omen harvest: fetch just enough real matches for the days that still lack an Omen
  // (one scenario per Omen per day). A failure only means those days wait for the next run.
  if (opts.harvestUntil !== 0) {
    const dates = Array.from({ length: days + 1 }, (_, i) => addDays(start, i));
    await harvest(opts.harvestUntil ?? Date.now() + 150_000, undefined, dates).catch((e) => console.error("[omens] harvest", e));
  }
  const data = await loadGameData();
  const analytics = memoAnalytics();
  matchesMemo.current = memoMatches();
  const all: GenResult[] = [];
  try {
    for (let i = 0; i <= days; i++) all.push(...(await generateDay(addDays(start, i), { data, analytics })));
    const errors = all.filter((r) => r.status === "error");
    const todayMissing = all.filter((r) => r.date === start && !["created", "exists"].includes(r.status));
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: errors.length ? "failed" : "ok", finishedAt: new Date(),
        counts: countBy(all), issues: all.filter((r) => r.status !== "created" && r.status !== "exists") as unknown as Prisma.InputJsonValue,
        error: errors.length ? errors.map((e) => `${e.date} ${e.slug}: ${e.note}`).join("\n") : null,
      },
    });
    if (errors.length) await alert(`Puzzle generation had ${errors.length} error(s): ${errors.map((e) => `${e.date}/${e.slug}`).join(", ")}`);
    if (todayMissing.length) await alert(`Today (${start}) has no puzzle for: ${todayMissing.map((r) => `${r.slug} (${r.note ?? r.status})`).join(", ")}`);
  } catch (e) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: String(e) } });
    await alert(`Puzzle generation crashed: ${(e as Error).message}`);
    throw e;
  }
  return all;
}

function countBy(rs: GenResult[]) {
  const c: Record<string, number> = {};
  for (const r of rs) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}

/** Admin override: freeze a specific answer for a day. */
export async function overridePuzzle(date: string, slug: string, answerId: string): Promise<void> {
  const lock = LOCKS.find((l) => l.slug === slug);
  if (!lock) throw new Error("unknown lock");
  if (!MODES[lock.mode]) throw new Error(`${lock.name} has no answer list; use its own admin page`);
  const data = await loadGameData();
  const pool = MODES[lock.mode].candidates(data, { dayIndex: dayIndex(date) });
  const candidate = pool.find((c) => c.answerId === answerId);
  if (!candidate) throw new Error(`${answerId} is not an eligible answer for ${slug}`);
  const built = await buildPuzzle(lock, date, data, memoAnalytics(), candidate);
  if (!built) throw new Error("could not build puzzle");
  const row = {
    answerId, payload: built.payload as unknown as Prisma.InputJsonValue,
    dataVersion: await latestDataVersion(), sealed: false, sealedReason: null, overridden: true,
  };
  await db.dailyPuzzle.upsert({ where: { date_mode: { date, mode: slug } }, create: { date, mode: slug, ...row }, update: row });
}
