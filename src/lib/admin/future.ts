// Future puzzles (tomorrow on) in the admin: clear them, or rebuild them now, after data was corrected.
// Puzzles freeze their data when built, so a fix only reaches days that are built after it.
// Today and past days are never touched here (today's puzzles are live). The Omens are left out: they are real
// matches that need a harvest to rebuild (use /admin/omens for those).
import { HARD_LOCKS, LOCKS } from "@/locks.config";
import { config } from "../config";
import { todayDate } from "../day";
import { db } from "../db";
import { generateDay, memoAnalytics, overridePuzzle, type GenResult } from "../engine/generate";
import { loadGameData } from "../engine/context";
import { puzzlesChanged } from "../server/cache";
import { addDays } from "../time";

const ALL = [...LOCKS, ...HARD_LOCKS];
const OMENS = new Set(LOCKS.filter((l) => l.group === "omens").map((l) => l.slug));
/** Every lock slug the admin can clear or rebuild (all but the Omens). */
export const REBUILDABLE = ALL.map((l) => l.slug).filter((s) => !OMENS.has(s));

/** Locks (with their hard puzzles) whose puzzles freeze hero or item category values. */
export function slugsUsing(entity: "hero" | "item"): string[] {
  const modes = entity === "hero" ? ["classic", "constellation"] : ["item-classic"];
  return ALL.filter((l) => modes.includes(l.mode)).map((l) => l.slug);
}

/** Days after today that may hold generated puzzles. */
export function futureDays(): string[] {
  const today = todayDate();
  return Array.from({ length: config.generateDaysAhead }, (_, i) => addDays(today, i + 1));
}

function pick(slugs?: string[]) {
  const out = (slugs ?? REBUILDABLE).filter((s) => REBUILDABLE.includes(s));
  if (!out.length) throw new Error("No lock to change (the Omens are rebuilt in /admin/omens).");
  return out;
}

function checkDate(date: string | undefined) {
  if (date !== undefined && date <= todayDate()) throw new Error("Only days after today can be changed; today's puzzles are live.");
}

/** Delete future puzzles (one day or all future days; some or all locks). Admin overrides go too unless kept. */
export async function clearFuturePuzzles(opts: { date?: string; slugs?: string[]; keepOverrides?: boolean } = {}): Promise<number> {
  checkDate(opts.date);
  const r = await db.dailyPuzzle.deleteMany({
    where: {
      date: opts.date ?? { gt: todayDate() },
      mode: { in: pick(opts.slugs) },
      ...(opts.keepOverrides ? { overridden: false } : {}),
    },
  });
  if (r.count) puzzlesChanged();
  return r.count;
}

/**
 * Build future puzzles again from the current data (one day or all future days). Admin overrides keep their answer
 * and are rebuilt around it, so they get the corrected data too.
 */
export async function rebuildFuturePuzzles(opts: { date?: string; slugs?: string[] } = {}): Promise<GenResult[]> {
  checkDate(opts.date);
  const slugs = pick(opts.slugs);
  const data = await loadGameData();
  const analytics = memoAnalytics();
  const out: GenResult[] = [];
  for (const date of opts.date ? [opts.date] : futureDays()) {
    for (const r of await generateDay(date, { data, analytics, slugs, force: true })) {
      if (r.status !== "exists" || !r.answerId) { out.push(r); continue; }
      try {
        await overridePuzzle(r.date, r.slug, r.answerId);
        out.push({ ...r, status: "created", note: "override rebuilt" });
      } catch (e) {
        out.push({ ...r, note: `override kept as built: ${(e as Error).message}` });
      }
    }
  }
  return out;
}

/** One line for the admin: what a rebuild did. */
export function summarize(results: GenResult[]): string {
  const n = (s: string) => results.filter((r) => r.status === s).length;
  const problems = results.filter((r) => r.status === "error" || r.status === "skipped").map((r) => `${r.date} ${r.slug}: ${r.note ?? r.status}`);
  return `${n("created")} built, ${n("exists")} left as they were` + (problems.length ? `. Not built: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? " …" : ""}` : ".");
}
