// Leaderboards. Only ranked plays count: played guess by guess while signed in, on the puzzle's own day.
import { db } from "../db";
import { todayDate } from "../day";
import { addDays } from "../time";
import { weekStart } from "./rules";
import { boxOf } from "@/locks.config";
import { foldPlays } from "../seance/scoring";
import { tablesInPlay } from "../seance/library";
import { collectionCounts, cosmeticsOf } from "../market/service";

export type Board = "today" | "week" | "all" | "streak" | "collectors";
export const BOARDS: { id: Board; label: string; sub: string }[] = [
  { id: "today", label: "Today", sub: "Souls earned today" },
  { id: "week", label: "This week", sub: "Souls since Monday" },
  { id: "all", label: "All time", sub: "Total souls" },
  { id: "streak", label: "Streaks", sub: "Days unlocked in a row" },
  { id: "collectors", label: "Collectors", sub: "Total worth of the collection (The Black Market)" },
];

/** `title`/`color`: the player's equipped cosmetics (The Black Market). */
export type BoardRow = { rank: number; name: string; value: number; detail?: string; me?: boolean; title?: string | null; color?: string | null };
export type BoardResult = { board: Board; rows: BoardRow[]; me: BoardRow | null; total: number };

const LIMIT = 50;

/** A ranked player before the public view: the internal id stays on the server and never reaches the browser. */
type Ranked = BoardRow & { userId: string };

function rank(entries: { userId: string; value: number; tie?: number; detail?: string }[], names: Map<string, string>, meId?: string): Ranked[] {
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

/** The whole ranking of a board (every player), the same for everybody; `getBoard` adds who is looking. */
async function ranking(board: Board): Promise<Ranked[]> {
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
  } else if (board === "collectors") {
    entries = (await collectionCounts()).map((e) => ({ ...e, detail: "souls of items" }));
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

  return rank(entries, names);
}

// Every board is a scan over players and plays, and the Hall page asks for all five on each visit. The ranking is the same
// for everybody, so it is computed once per TTL per server instance (concurrent requests share one computation); a play
// shows on the boards within the TTL. Failures are not cached.
const BOARD_TTL_MS = 30_000;
const memo = new Map<Board, { at: number; value: Promise<Ranked[]> }>();
function cachedRanking(board: Board): Promise<Ranked[]> {
  const hit = memo.get(board);
  if (hit && Date.now() - hit.at < BOARD_TTL_MS) return hit.value;
  const value = ranking(board);
  memo.set(board, { at: Date.now(), value });
  value.catch(() => { if (memo.get(board)?.value === value) memo.delete(board); });
  return value;
}
/** For tests and scripts: forget the remembered rankings. */
export const forgetBoards = () => memo.clear();

export async function getBoard(board: Board, meId?: string): Promise<BoardResult> {
  const all = (await cachedRanking(board)).map((r) => (r.userId === meId ? { ...r, me: true } : r));
  const rows = all.slice(0, LIMIT);
  const me = all.find((r) => r.me) ?? null;
  const looks = await cosmeticsOf([...rows, ...(me ? [me] : [])].map((r) => r.userId));
  const dress = ({ userId, ...r }: Ranked): BoardRow => ({ ...r, ...looks.get(userId) });
  return { board, rows: rows.map(dress), me: me && dress(me), total: all.length };
}
