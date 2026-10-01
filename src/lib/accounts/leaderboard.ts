// Leaderboards. Only ranked plays count: played guess by guess while signed in, on the puzzle's own day.
import { db } from "../db";
import { todayDate } from "../day";
import { addDays } from "../time";
import { weekStart } from "./rules";
import { boxOf } from "@/locks.config";
import { foldPlays } from "../seance/scoring";
import { tablesInPlay } from "../seance/library";

export type Board = "today" | "week" | "all" | "streak";
export const BOARDS: { id: Board; label: string; sub: string }[] = [
  { id: "today", label: "Today", sub: "Souls earned today" },
  { id: "week", label: "This week", sub: "Souls since Monday" },
  { id: "all", label: "All time", sub: "Total souls" },
  { id: "streak", label: "Streaks", sub: "Days unlocked in a row" },
];

export type BoardRow = { rank: number; userId: string; name: string; value: number; detail?: string; me?: boolean };
export type BoardResult = { board: Board; rows: BoardRow[]; me: BoardRow | null; total: number };

const LIMIT = 50;

function rank(entries: { userId: string; value: number; tie?: number; detail?: string }[], names: Map<string, string>, meId?: string): BoardResult["rows"] {
  const sorted = entries
    .filter((e) => names.has(e.userId) && e.value > 0)
    .sort((a, b) => b.value - a.value || (a.tie ?? 0) - (b.tie ?? 0) || names.get(a.userId)!.localeCompare(names.get(b.userId)!));
  let prev: { value: number; tie?: number } | null = null;
  let r = 0;
  return sorted.map((e, i) => {
    if (!prev || prev.value !== e.value || (prev.tie ?? 0) !== (e.tie ?? 0)) r = i + 1;
    prev = e;
    return { rank: r, userId: e.userId, name: names.get(e.userId)!, value: e.value, detail: e.detail, me: e.userId === meId };
  });
}

export async function getBoard(board: Board, meId?: string): Promise<BoardResult> {
  const today = todayDate();
  // Hidden players never take a rank, not even in their own view.
  const profiles = await db.profile.findMany({ where: { showOnBoards: true }, select: { userId: true, displayName: true } });
  const names = new Map(profiles.map((p) => [p.userId, p.displayName]));
  let entries: { userId: string; value: number; tie?: number; detail?: string }[] = [];

  if (board === "today" || board === "week") {
    const from = board === "today" ? today : weekStart(today);
    const [plays, inPlay] = await Promise.all([
      db.play.findMany({
        where: { source: "live", archive: false, status: { not: "playing" }, date: { gte: from, lte: today } },
        select: { userId: true, date: true, lock: true, souls: true, status: true },
      }),
      tablesInPlay({ gte: from, lte: today }),
    ]);
    // Per player; the Séance's four tables fold into one box worth their average (one lock opened).
    const byUser = new Map<string, typeof plays>();
    for (const p of plays) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
    entries = [...byUser].map(([userId, ps]) => {
      const f = foldPlays(ps, boxOf, inPlay);
      return { userId, value: f.souls, tie: -f.opened, detail: `${f.opened} locks opened` };
    });
  } else {
    const yesterday = addDays(today, -1);
    const stats = await db.userStats.findMany();
    entries = stats.map((s) =>
      board === "all"
        ? { userId: s.userId, value: s.totalSouls, detail: `${s.daysUnlocked} days unlocked` }
        : {
            userId: s.userId,
            // A streak is only alive if the last ranked win was today or yesterday.
            value: s.lastDay && s.lastDay >= yesterday ? s.currentStreak : 0,
            tie: -s.bestStreak,
            detail: `best ${s.bestStreak}`,
          },
    );
  }

  const all = rank(entries, names, meId);
  return { board, rows: all.slice(0, LIMIT), me: all.find((r) => r.me) ?? null, total: all.length };
}
