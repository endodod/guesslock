// Server-side puzzle queries used by pages and API routes.
import { db } from "../db";
import { LOCKS } from "@/locks.config";
import type { BasePayload } from "../engine/mode";
import type { AnswerView } from "../engine/types";
import type { BeastAnswer, ClashAnswer, OmenPayload, RiftAnswer } from "../omens/types";

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

export async function getPuzzle(date: string, slug: string) {
  return db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
}

export async function dayMeta(date: string): Promise<LockMeta[]> {
  const rows = await db.dailyPuzzle.findMany({ where: { date }, select: { mode: true, sealed: true, sealedReason: true } });
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
    const payload = r.payload as unknown as BasePayload | OmenPayload;
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
