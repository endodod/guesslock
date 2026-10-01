// Endless mode, this device's side: the puzzle in progress per lock, recently seen answers (skipped next time) and
// practice stats. Never mixed into the daily progress, souls or streaks.
import type { LockRecord } from "./store";

export type EndlessStats = { played: number; won: number; streak: number; best: number };
export type EndlessData = {
  current: Record<string, { token: string; rec?: LockRecord; counted?: boolean }>;
  recent: Record<string, string[]>;
  stats: Record<string, EndlessStats>;
};

const KEY = "guesslock:endless";
/** Guest mode: practice data stays in this tab (sessionStorage) instead of the device. */
let guest = false;
export const setEndlessGuest = (g: boolean) => { guest = g; };
const storage = () => (guest ? sessionStorage : localStorage);
const RECENT = 12;
export const emptyEndless = (): EndlessData => ({ current: {}, recent: {}, stats: {} });

export function loadEndless(): EndlessData {
  try {
    const raw = JSON.parse(storage().getItem(KEY) ?? "null");
    return raw && typeof raw === "object" ? { ...emptyEndless(), ...raw } : emptyEndless();
  } catch {
    return emptyEndless();
  }
}

export function saveEndless(d: EndlessData) {
  try { storage().setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked: practice still works */ }
}

/** Stores a record; the first time a puzzle finishes it counts once for the stats and its answer joins `recent`. */
export function recordEndless(d: EndlessData, slug: string, token: string, rec: LockRecord, answerKey?: string): EndlessData {
  const cur = d.current[slug]?.token === token ? d.current[slug] : { token };
  const done = rec.s === "won" || rec.s === "lost";
  const next: EndlessData = { ...d, current: { ...d.current, [slug]: { ...cur, rec } } };
  if (done && !cur.counted) {
    const s = d.stats[slug] ?? { played: 0, won: 0, streak: 0, best: 0 };
    const won = rec.s === "won";
    const streak = won ? s.streak + 1 : 0;
    next.stats = { ...d.stats, [slug]: { played: s.played + 1, won: s.won + (won ? 1 : 0), streak, best: Math.max(s.best, streak) } };
    next.current[slug].counted = true;
    if (answerKey) next.recent = { ...d.recent, [slug]: [answerKey, ...(d.recent[slug] ?? []).filter((k) => k !== answerKey)].slice(0, RECENT) };
  }
  return next;
}
