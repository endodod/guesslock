// Server-side puzzle queries used by pages and API routes.
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { PUZZLES_TAG } from "./cache";
import { LOCKS } from "@/locks.config";
import type { BasePayload } from "../engine/mode";
import type { AnswerView } from "../engine/types";
import type { BeastAnswer, ClashAnswer, OmenPayload, RiftAnswer } from "../omens/types";
import type { SeancePayload } from "../seance/types";

const TEAM = { amber: "Amber", sapphire: "Sapphire" } as const;

/** One-line outcome of an Omen, for Yesterday's answers. */
function omenOutcome(p: OmenPayload): AnswerView {
  const clock = `${Math.floor(p.snapshot.t / 60)}:${String(p.snapshot.t % 60).padStart(2, "0")}`;
  let name: string;
  if (p.omen === "clash") {
    const a = p.answer as ClashAnswer;
    name = a.anyDeath ? `${a.deaths.amber} Amber, ${a.deaths.sapphire} Sapphire deaths` : "Nobody died";
  } else if (p.omen === "beast") {
    const a = p.answer as BeastAnswer;
    name = !a.killed ? "The midboss survived" : a.killer === a.claimer ? `${TEAM[a.killer!]} took the midboss` : `${TEAM[a.killer!]} killed it, ${TEAM[a.claimer!]} stole the rejuv`;
  } else {
    const a = p.answer as RiftAnswer;
    name = a.claimer === "none" ? "The rift expired" : `${TEAM[a.claimer]} claimed the rift`;
  }
  return { id: p.scenarioId, name, image: null, sub: `Match ${p.matchId} at ${clock}` };
}

export type LockMeta = { slug: string; state: "available" | "sealed" | "empty"; sealedReason?: string };

const PUZZLE_FIELDS = { date: true, mode: true, answerId: true, payload: true, sealed: true, sealedReason: true, overridden: true } as const;

/** The frozen puzzle straight from the database (admin pages, which must see edits at once). */
export async function getPuzzleFresh(date: string, slug: string) {
  return db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } }, select: PUZZLE_FIELDS });
}

// Frozen puzzles change only when a day is (re)generated, overridden or healed, all of which call puzzlesChanged().
// Caching them for a minute takes the database read out of every guess (/api/play) and lock page view.
const cachedPuzzle = unstable_cache(getPuzzleFresh, ["puzzle"], { revalidate: 60, tags: [PUZZLES_TAG] });
const cachedMeta = unstable_cache((date: string) => db.dailyPuzzle.findMany({ where: { date }, select: { mode: true, sealed: true, sealedReason: true } }), ["day-meta"], { revalidate: 60, tags: [PUZZLES_TAG] });

export async function getPuzzle(date: string, slug: string) {
  return cachedPuzzle(date, slug);
}

export async function dayMeta(date: string): Promise<LockMeta[]> {
  const rows = await cachedMeta(date);
  const by = new Map(rows.map((r) => [r.mode, r]));
  return LOCKS.map((l) => {
    const r = by.get(l.slug);
    if (!r) return { slug: l.slug, state: "empty" as const };
    return r.sealed ? { slug: l.slug, state: "sealed" as const, sealedReason: r.sealedReason ?? undefined } : { slug: l.slug, state: "available" as const };
  });
}

export async function answersFor(date: string) {
  const rows = await db.dailyPuzzle.findMany({ where: { date, sealed: false } });
  const by = new Map(rows.map((r) => {
    const payload = r.payload as unknown as BasePayload | OmenPayload | SeancePayload;
    if (payload.mode === "seance") {
      // The Séance: the day's four group names, easiest first.
      const p = payload as SeancePayload;
      return [r.mode, { id: r.answerId, name: p.groups.map((g) => g.label).join(" · "), image: null, sub: `${p.redHerrings} red herrings` }];
    }
    return [r.mode, payload.mode === "omen" ? omenOutcome(payload as OmenPayload) : (payload as BasePayload).answer];
  }));
  return LOCKS.map((l) => ({ lock: l, answer: by.get(l.slug) ?? null }));
}

export async function playedDates(from: string, to: string): Promise<string[]> {
  const rows = await db.dailyPuzzle.findMany({
    where: { date: { gte: from, lte: to }, sealed: false },
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "desc" },
  });
  return rows.map((r) => r.date);
}
