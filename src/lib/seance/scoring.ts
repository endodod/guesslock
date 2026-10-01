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
 * Souls and opened locks of a player's plays, with each day's tables folded into their box (the Séance, the
 * Bazaar, the Grimoire: worth the average of their tables; "opened" once every table in play is finished).
 * Leaderboards, stats and the Ledger all count this way. `boxOf(slug)` = the box of a table (a plain `true`
 * means the Séance), `inPlay(date, box)` = the day's unsealed tables of that box.
 */
export function foldPlays(
  plays: { date: string; lock: string; souls: number; status: string }[],
  boxOf: (slug: string) => string | boolean | null,
  inPlay: (date: string, box: string) => number,
): { souls: number; opened: number } {
  let souls = 0, opened = 0;
  const tables = new Map<string, { date: string; box: string; souls: number[]; finished: number }>();
  for (const p of plays) {
    const b = boxOf(p.lock);
    if (!b) {
      souls += p.souls;
      if (p.status === "won") opened++;
      continue;
    }
    const box = typeof b === "string" ? b : "seance";
    const k = `${box}|${p.date}`;
    const t = tables.get(k) ?? { date: p.date, box, souls: [], finished: 0 };
    t.souls.push(p.status === "won" || p.status === "lost" ? p.souls : 0);
    if (p.status === "won" || p.status === "lost") t.finished++;
    tables.set(k, t);
  }
  for (const t of tables.values()) {
    const n = inPlay(t.date, t.box);
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
  /** The box's name ("The Bazaar"); defaults to The Séance. */
  box?: string;
}): string {
  const grid = opts.rows.map((r) => r.map((k) => RANK_EMOJI[k]).join("")).join("\n");
  const m = `${opts.mistakes} ${opts.mistakes === 1 ? "mistake" : "mistakes"}`;
  return [
    `GUESSLOCK #${opts.number} — ${opts.box ?? "The Séance"} · ${opts.table}`,
    ...(grid ? [grid] : []),
    `${opts.won ? m : `🔒 ${m}`} · ${opts.souls} souls`,
    opts.site,
  ].join("\n");
}
