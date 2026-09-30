// Souls and share text (pure; unit-tested). Share text never contains clue content.
import { LOCK_BY_SLUG, LOCKS, OMEN_LOCKS, SEANCE_LOCKS, SHOP_LOCKS, SPIRIT_LOCKS, VAULT_UNITS, type LockDef } from "@/locks.config";
import { omenSymbol } from "../omens/scoring";
import { foldPlays, tableSymbol } from "../seance/scoring";
import type { Tile } from "../engine/types";

export const BONUS_SOULS = 25;

/** souls = max(10, 100 − 10 × (guesses − 1)) − 15 × hintsUsed, min 10 on a win; 0 on a loss. */
export function soulsFor(result: { won: boolean; guesses: number; hintsUsed: number; bonusCorrect?: boolean }): number {
  if (!result.won) return 0;
  const base = Math.max(10, 100 - 10 * (result.guesses - 1)) - 15 * result.hintsUsed;
  return Math.max(10, base) + (result.bonusCorrect ? BONUS_SOULS : 0);
}

export type LockResult = {
  status: "won" | "lost" | "playing" | "sealed" | "none"; guesses: number; souls: number;
  /** The Séance tables: mistakes made. */
  mistakes?: number;
};

export function shareLock(opts: {
  lock: LockDef; number: number; result: LockResult; site: string; grid?: Tile[][];
}): string {
  const { lock, number, result, site } = opts;
  const head = `GUESSLOCK #${number} — ${lock.name}`;
  const line =
    result.status === "won"
      ? `🔓 ${result.guesses} ${result.guesses === 1 ? "pick" : "picks"} · ${result.souls} souls`
      : `🔒 jammed · 0 souls`;
  const grid = opts.grid?.length
    ? "\n" + opts.grid.map((row) => row.map((t) => (t.result === "match" ? "🟩" : t.result === "partial" ? "🟨" : "🟥")).join("")).join("\n")
    : "";
  return `${head}\n${line}${grid}\n${site}`;
}

/** Per-Omen share: one ✓/✗ per question, never the scenario itself. */
export function shareOmen(opts: { lock: LockDef; number: number; ticks: string; souls: number; site: string }): string {
  return `GUESSLOCK #${opts.number} — ${opts.lock.name}\n${opts.ticks} · ${opts.souls} souls\n${opts.site}`;
}

export function symbolFor(r: LockResult | undefined, lock?: LockDef): string {
  if (lock?.group === "omens") return r?.status === "won" ? omenSymbol(r.souls) : "▫️";
  if (!r) return "▫️";
  if (r.status === "won") return r.guesses <= 3 ? "✨" : "🔓";
  if (r.status === "lost") return "🔒";
  return "▫️";
}

/**
 * Souls and opened locks of a day, with the Séance tables folded into one box (see foldPlays).
 * `seanceInPlay` = the day's unsealed Séance tables.
 */
export function dayTotals(results: Record<string, LockResult>, seanceInPlay: number): { souls: number; opened: number } {
  const plays = LOCKS.flatMap((l) => {
    const r = results[l.slug];
    return r && r.status !== "none" && r.status !== "sealed" ? [{ date: "d", lock: l.slug, souls: r.souls, status: r.status }] : [];
  });
  return foldPlays(plays, (s) => LOCK_BY_SLUG[s]?.box === "seance", () => seanceInPlay);
}

export function shareDay(opts: {
  number: number; results: Record<string, LockResult>; streak: number; site: string; seanceInPlay?: number;
}): string {
  const { number, results, streak, site, seanceInPlay = 0 } = opts;
  const { souls, opened } = dayTotals(results, seanceInPlay);
  return [
    `GUESSLOCK #${number} — ${opened}/${VAULT_UNITS.length} locks · ${souls} souls`,
    `Spirits  ${SPIRIT_LOCKS.map((l) => symbolFor(results[l.slug])).join("")}`,
    `Shop     ${SHOP_LOCKS.map((l) => symbolFor(results[l.slug])).join("")}`,
    `Omens    ${OMEN_LOCKS.map((l) => symbolFor(results[l.slug], l)).join("")}`,
    ...(seanceInPlay > 0
      ? [`Séance   ${SEANCE_LOCKS.map((l) => {
          const r = results[l.slug];
          return tableSymbol(r && (r.status === "won" || r.status === "lost") ? { status: r.status, mistakes: r.mistakes ?? 0 } : undefined);
        }).join("")}`]
      : []),
    `🔥 ${streak} ${streak === 1 ? "day" : "days"}`,
    site,
  ].join("\n");
}
