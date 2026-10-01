// Endless mode: practice puzzles of any guessing lock, built on request and frozen like a daily puzzle (in
// EndlessPuzzle, keyed by a random token). Played through the same evaluator as the daily locks; never counted for
// souls, streaks or leaderboards. Old puzzles and their clue images are pruned after ENDLESS_TTL_DAYS.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { LOCKS, getLock, type LockDef } from "@/locks.config";
import { makeRng } from "./rng";
import { loadGameData, type GameData } from "./engine/context";
import { MODES } from "./engine/registry";
import { SealedError, SkipCandidate, type BasePayload } from "./engine/mode";
import { orderCandidates } from "./engine/select";
import { evaluate } from "./engine/play";
import { getCatalog, lookupFor } from "./engine/catalog";
import { fetchAbilityOrder } from "./deadlock/api";
import { clueImages } from "./image/clue";
import { heroCategories, memoAnalytics, memoMatches } from "./engine/generate";
import type { Prisma } from "@/generated/prisma/client";

export const ENDLESS_TTL_DAYS = 7;
const TOKEN = /^[a-f0-9]{32}$/;

/** Locks that can be played endlessly: every guessing lock with an engine mode (not the Omens or the sorting tables). */
export const ENDLESS_LOCKS: LockDef[] = LOCKS.filter((l) => !!MODES[l.mode] && l.group !== "omens" && !l.box);
export const isEndlessLock = (slug: string) => ENDLESS_LOCKS.some((l) => l.slug === slug);
export const isToken = (t: unknown): t is string => typeof t === "string" && TOKEN.test(t);

// Game data and analytics are shared between requests for a while (built per server instance).
let cached: { at: number; data: Promise<GameData>; analytics: ReturnType<typeof memoAnalytics>; matches: ReturnType<typeof memoMatches> } | null = null;
function shared() {
  if (!cached || Date.now() - cached.at > 10 * 60_000) cached = { at: Date.now(), data: loadGameData(), analytics: memoAnalytics(), matches: memoMatches() };
  return cached;
}

/**
 * Builds a fresh practice puzzle. `avoid` = answer ids the player just had (a short client-side list), tried last.
 * Returns null when the lock has nothing to build (no eligible answers, no data).
 */
export async function createEndless(slug: string, avoid: string[] = []): Promise<{ token: string } | null> {
  const lock = getLock(slug);
  if (!lock || !isEndlessLock(slug)) return null;
  const impl = MODES[lock.mode];
  const s = shared();
  const data = await s.data;
  const token = randomBytes(16).toString("hex");
  const tag = `endless:${token}`;
  const dayIndex = parseInt(token.slice(0, 6), 16);
  const order = orderCandidates(impl.candidates(data, { dayIndex }), avoid, tag);
  for (const candidate of order.slice(0, 8)) {
    try {
      const payload: BasePayload = await impl.build(candidate, {
        data, rng: makeRng(`${tag}|build`), date: tag, dayIndex, analytics: s.analytics, abilityOrder: fetchAbilityOrder,
        images: clueImages, matches: s.matches, heroCategories, recent: avoid,
      });
      await db.endlessPuzzle.create({ data: { id: token, lock: slug, answerId: payload.key ?? candidate.answerId, payload: payload as unknown as Prisma.InputJsonValue } });
      return { token };
    } catch (e) {
      if (e instanceof SkipCandidate) continue;
      if (e instanceof SealedError) return null;
      throw e;
    }
  }
  return null;
}

export async function playEndless(token: string, guesses: string[], opts: { bonus?: string; hard?: boolean; giveUp?: boolean } = {}) {
  const row = await db.endlessPuzzle.findUnique({ where: { id: token } });
  if (!row) return null;
  const lock = getLock(row.lock)!;
  const catalog = await getCatalog();
  const view = evaluate(lock, { date: "endless", mode: row.lock, sealed: false, sealedReason: null, payload: row.payload }, 0, guesses, opts.bonus, lookupFor(catalog, lock.guess), { hard: opts.hard, giveUp: opts.giveUp });
  return { lock, view: { ...view, date: "endless" }, answerId: row.answerId };
}

/** Deletes practice puzzles (and their clue images) older than ENDLESS_TTL_DAYS. */
export async function pruneEndless(): Promise<{ puzzles: number; images: number }> {
  const cutoff = new Date(Date.now() - ENDLESS_TTL_DAYS * 86400_000);
  const puzzles = await db.endlessPuzzle.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const images = await db.mirroredAsset.deleteMany({ where: { sourceUrl: { startsWith: "derived:endless:" }, fetchedAt: { lt: cutoff } } });
  return { puzzles: puzzles.count, images: images.count };
}
