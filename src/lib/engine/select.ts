// Pure selection logic (unit-tested): seeded, deterministic, with a no-repeat window.
import { makeRng } from "../rng";
import type { Candidate } from "./mode";

export function noRepeatWindow(poolSize: number, maxDays: number, override?: number): number {
  if (override !== undefined) return Math.min(override, Math.max(0, poolSize - 1));
  return Math.min(maxDays, Math.floor(poolSize * 0.6));
}

/**
 * Deterministic candidate order for a seed: candidates not used in the recent window first
 * (in seeded random order), then the rest. The engine takes the first one that builds.
 */
export function orderCandidates(candidates: Candidate[], recentAnswerIds: Iterable<string>, seed: string): Candidate[] {
  const recent = new Set(recentAnswerIds);
  const sorted = [...candidates].sort((a, b) => (a.answerId < b.answerId ? -1 : a.answerId > b.answerId ? 1 : 0));
  const rng = makeRng(`${seed}|pick`);
  const shuffled = rng.shuffle(sorted);
  const fresh = shuffled.filter((c) => !recent.has(c.answerId));
  const used = shuffled.filter((c) => recent.has(c.answerId));
  return [...fresh, ...used];
}

export function selectAnswer(candidates: Candidate[], recentAnswerIds: Iterable<string>, seed: string): Candidate | null {
  return orderCandidates(candidates, recentAnswerIds, seed)[0] ?? null;
}
