// "Is there enough data?" per lock: answer pool size, the no-repeat window that pool allows, and how many of the
// generated days ahead are sealed. Used by /admin/coverage and the agent API's state.
import { db } from "../db";
import { config } from "../config";
import { LOCKS } from "@/locks.config";
import { addDays } from "../time";
import { todayDate, dayIndex } from "../day";
import type { GameData } from "../engine/context";
import { MODES } from "../engine/registry";
import { noRepeatWindow } from "../engine/select";

export type Coverage = {
  slug: string; name: string; numeral: string;
  /** Distinct answers available today (null: the lock picks from harvested matches or a category library). */
  pool: number | null;
  /** Days before an answer may repeat. */
  window: number | null;
  /** Generated days from today on: open, sealed (with the reasons). */
  ahead: { open: number; sealed: number; reasons: string[] };
  verdict: "ok" | "thin" | "empty" | "sealed";
  note: string;
};

/** A pool under this many answers repeats within a month or so: worth curating more. */
export const THIN_POOL = 20;

export async function lockCoverage(data: GameData): Promise<Coverage[]> {
  const today = todayDate();
  const rows = await db.dailyPuzzle.findMany({
    where: { date: { gte: today, lte: addDays(today, config.generateDaysAhead) } },
    select: { mode: true, sealed: true, sealedReason: true },
  });
  return LOCKS.map((l) => {
    const mine = rows.filter((r) => r.mode === l.slug);
    const ahead = {
      open: mine.filter((r) => !r.sealed).length,
      sealed: mine.filter((r) => r.sealed).length,
      reasons: [...new Set(mine.filter((r) => r.sealed).map((r) => r.sealedReason ?? "sealed"))],
    };
    const impl = MODES[l.mode];
    const pool = impl && !impl.selfPicked ? impl.candidates(data, { dayIndex: dayIndex(today) }).length : null;
    const window = pool === null ? null : noRepeatWindow(pool, config.maxNoRepeatDays, l.noRepeatDays);
    const verdict: Coverage["verdict"] =
      pool === 0 ? "empty" : ahead.open === 0 && ahead.sealed > 0 ? "sealed" : pool !== null && pool < THIN_POOL ? "thin" : "ok";
    const note =
      pool === 0 ? "No eligible answer: the lock is sealed until data or curation arrives."
      : pool === null ? (l.group === "omens" || l.slug === "cache" ? "Picks from harvested matches" : "Built from the category library")
      : pool < THIN_POOL ? `Only ${pool} answers: repeats after ${window} days.`
      : `${pool} answers, no repeat within ${window} days.`;
    return { slug: l.slug, name: l.name + (l.table ? ` · ${l.table.label}` : ""), numeral: l.numeral, pool, window, ahead, verdict, note };
  });
}
