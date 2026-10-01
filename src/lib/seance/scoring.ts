// Séance souls and share text (pure; unit-tested). Share text never contains labels or hero names.
import type { Rank } from "./types";

export const SEANCE_MISTAKES = 4;
export const SEANCE_HINT_AFTER = 2;
export const SEANCE_HINT_COST = 15;

/** Per table. Win: 100 − 20 × mistakes − 15 × hints (min 20). Loss: 10 × groups found. */
export function tableSouls(r: { won: boolean; mistakes: number; hints: number; groupsFound: number }): number {
  if (r.won) return Math.max(20, 100 - 20 * r.mistakes - SEANCE_HINT_COST * r.hints);
  return 10 * r.groupsFound;
}

/**
 * The Séance box: the rounded average of its tables, so it's worth at most 100 like every other lock.
 * The average runs over the tables in play that day (sealed tables don't count); unfinished ones count 0.
 */
export function boxSouls(tables: number[], inPlay: number): number {
  const n = Math.max(inPlay, tables.length);
  return n ? Math.round(tables.reduce((a, s) => a + s, 0) / n) : 0;
}

/**
 * Souls and opened locks of a player's plays, with each day's Séance tables folded into one box
 * (worth their average; "opened" once every table in play is finished). Leaderboards, stats and
 * the Ledger all count this way. `inPlay(date)` = the day's unsealed tables.
 */
export function foldPlays(
  plays: { date: string; lock: string; souls: number; status: string }[],
  isTable: (slug: string) => boolean,
  inPlay: (date: string) => number,
): { souls: number; opened: number } {
  let souls = 0, opened = 0;
  const tables = new Map<string, { souls: number[]; finished: number }>();
  for (const p of plays) {
    if (!isTable(p.lock)) {
      souls += p.souls;
      if (p.status === "won") opened++;
      continue;
    }
    const t = tables.get(p.date) ?? { souls: [], finished: 0 };
    t.souls.push(p.status === "won" || p.status === "lost" ? p.souls : 0);
    if (p.status === "won" || p.status === "lost") t.finished++;
    tables.set(p.date, t);
  }
  for (const [date, t] of tables) {
    const n = inPlay(date);
    souls += boxSouls(t.souls, n);
    if (n > 0 && t.finished >= n) opened++;
  }
  return { souls, opened };
}

/** Combined daily share, one symbol per table: ✨ no mistakes · 🔓 won with mistakes · 🔒 lost · ▫️ not finished. */
export function tableSymbol(r: { status: string; mistakes: number } | undefined): string {
  if (!r) return "▫️";
  if (r.status === "won") return r.mistakes === 0 ? "✨" : "🔓";
  if (r.status === "lost") return "🔒";
  return "▫️";
}

export const RANK_EMOJI: Record<Rank, string> = { 1: "🟨", 2: "🟩", 3: "🟦", 4: "🟪" };

/** Per-table share, Connections style: one row per submission, each emoji the hero's true group color. */
export function shareTable(opts: {
  number: number; table: string; rows: Rank[][]; won: boolean; mistakes: number; souls: number; site: string;
}): string {
  const grid = opts.rows.map((r) => r.map((k) => RANK_EMOJI[k]).join("")).join("\n");
  const m = `${opts.mistakes} ${opts.mistakes === 1 ? "mistake" : "mistakes"}`;
  return [
    `GUESSLOCK #${opts.number} — The Séance · ${opts.table}`,
    ...(grid ? [grid] : []),
    `${opts.won ? m : `🔒 ${m}`} · ${opts.souls} souls`,
    opts.site,
  ].join("\n");
}
