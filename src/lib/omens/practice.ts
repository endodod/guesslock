// Omen practice (server only): endless scenarios from pre-generated pools, and "My matches".
// Never counts toward souls or streaks. Upcoming daily Omens are never served here.
import { createHash } from "node:crypto";
import { db } from "../db";
import { todayDate } from "../day";
import { fetchJson } from "../deadlock/api";
import type { Prisma } from "@/generated/prisma/client";
import { STEAM64_BASE } from "./ingest";
import type { OmenKind, OmenPayload } from "./types";

export type PracticePool = "top" | "random";

/** Scenarios safe to practise: practice pools, and daily Omens whose day is over. */
function practiceWhere(omen: OmenKind): Prisma.ScenarioWhereInput {
  return {
    omen,
    status: { not: "rejected" },
    OR: [{ source: "practice" }, { source: "daily", dailyDate: { lt: todayDate() } }],
  };
}

export async function pickPractice(omen: OmenKind, pool: PracticePool, seen: string[], rank?: [number, number]): Promise<string | null> {
  const where: Prisma.ScenarioWhereInput = {
    ...practiceWhere(omen),
    id: { notIn: seen.slice(-500) },
    rank: pool === "top" ? { gte: 100 } : rank ? { gte: rank[0], lte: rank[1] } : undefined,
  };
  const n = await db.scenario.count({ where });
  if (!n) return null;
  const row = await db.scenario.findFirst({ where, skip: Math.floor(Math.random() * n), select: { id: true } });
  return row?.id ?? null;
}

/** A scenario the practice page may show (practice pool, past daily, or one of "My matches"). */
export async function practiceScenario(id: string): Promise<OmenPayload | null> {
  const row = await db.scenario.findUnique({ where: { id } });
  if (!row || row.status === "rejected") return null;
  const today = todayDate();
  const ok = row.source === "practice" || row.source === "mine" || (row.source === "daily" && !!row.dailyDate && row.dailyDate < today);
  return ok ? (row.payload as unknown as OmenPayload) : null;
}

export async function poolCounts(): Promise<Record<OmenKind, { top: number; all: number }>> {
  const out = {} as Record<OmenKind, { top: number; all: number }>;
  for (const omen of ["clash", "beast", "rift"] as OmenKind[]) {
    out[omen] = {
      all: await db.scenario.count({ where: practiceWhere(omen) }),
      top: await db.scenario.count({ where: { ...practiceWhere(omen), rank: { gte: 100 } } }),
    };
  }
  return out;
}

// ───────────── My matches ─────────────

/** Steam profile URL (…/profiles/7656…), SteamID64, [U:1:n] or account ID -> account ID. */
export function parseAccount(input: string): number | null {
  const s = input.trim();
  const profile = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  const id3 = s.match(/\[U:1:(\d+)\]/);
  const digits = profile?.[1] ?? id3?.[1] ?? (/^\d+$/.test(s) ? s : null);
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n > STEAM64_BASE ? n - STEAM64_BASE : n < 2 ** 32 ? n : null;
}

export const requesterHash = (ip: string) => createHash("sha1").update(`omens|${ip}`).digest("hex");
const MAX_REQUESTS_PER_DAY = 10;

export type MyMatch = {
  matchId: number;
  startTime: number;
  heroId: number;
  status: "ready" | "queued" | "no-replay" | "failed" | "limit";
  scenarios: { id: string; omen: OmenKind; myKey: number | null }[];
};

type HistoryRow = { match_id: number; start_time: number; hero_id: number; match_mode: number; game_mode: number };

/** The player's last 20 matches: ready scenarios, or queue the ones that have a replay (rate limited). */
export async function myMatches(account: number, requester: string): Promise<MyMatch[]> {
  const history = ((await fetchJson(`/v1/players/${account}/match-history`, { timeoutMs: 60000 })) as HistoryRow[])
    .filter((m) => m.game_mode === 1)
    .sort((a, b) => b.match_id - a.match_id)
    .slice(0, 20);
  const known = new Map(
    (await db.omenMatch.findMany({
      where: { matchId: { in: history.map((m) => BigInt(m.match_id)) } },
      // Never offer a scenario that is (or may become) an upcoming daily Omen.
      include: {
        scenarios: {
          where: { status: { not: "rejected" }, OR: [{ source: { in: ["practice", "mine"] } }, { source: "daily", dailyDate: { lt: todayDate() } }] },
          select: { id: true, omen: true, payload: true },
        },
      },
    })).map((m) => [Number(m.matchId), m]),
  );
  let used = await db.omenMatch.count({ where: { requestedBy: requester, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  const out: MyMatch[] = [];
  for (const h of history) {
    const m = known.get(h.match_id);
    const base = { matchId: h.match_id, startTime: h.start_time, heroId: h.hero_id };
    if (m) {
      const status = m.status === "ready" ? "ready" : m.status === "rejected" ? "no-replay" : m.status === "failed" ? "failed" : "queued";
      out.push({
        ...base, status,
        scenarios: m.scenarios.map((s) => {
          const heroes = (s.payload as unknown as OmenPayload).snapshot.heroes;
          const key = heroes.find((x) => x.heroId === h.hero_id)?.key ?? null;
          return { id: s.id, omen: s.omen as OmenKind, myKey: key };
        }),
      });
      continue;
    }
    const salts = (await fetchJson(`/v1/matches/${h.match_id}/salts?disable_steam=true`).catch(() => null)) as { replay_salt?: number | null } | null;
    if (!salts?.replay_salt) { out.push({ ...base, status: "no-replay", scenarios: [] }); continue; }
    if (used >= MAX_REQUESTS_PER_DAY) { out.push({ ...base, status: "limit", scenarios: [] }); continue; }
    await db.omenMatch.create({ data: { matchId: BigInt(h.match_id), status: "queued", source: "mine", priority: 5, requestedBy: requester } });
    used++;
    out.push({ ...base, status: "queued", scenarios: [] });
  }
  return out;
}
