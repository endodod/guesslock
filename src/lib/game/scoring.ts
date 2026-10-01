// Souls and share text (pure; unit-tested). Share text never contains clue content.
import { boxOf, LOCKS, OMEN_LOCKS, SEANCE_BOX_LIST, seanceLocksOf, SHOP_LOCKS, SPIRIT_LOCKS, STAR_LOCKS, VAULT_UNITS, type LockDef, type SeanceBoxId } from "@/locks.config";
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

/** Hard mode: a finished play is worth half as much again (a loss stays 0). */
export const HARD_MULTIPLIER = 1.5;
export function hardSouls(souls: number): number {
  return Math.round(souls * HARD_MULTIPLIER);
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

/** Unsealed tables of a day per box; a plain number counts for The Séance only. */
export type BoxesInPlay = number | Partial<Record<SeanceBoxId, number>>;
const inPlayOf = (b: BoxesInPlay | undefined, box: string) => (typeof b === "number" ? (box === "seance" ? b : 0) : b?.[box as SeanceBoxId] ?? 0);

/**
 * Souls and opened locks of a day, with the tables folded into their boxes (see foldPlays).
 * `seanceInPlay` = the day's unsealed tables per box; `skip` = slugs the player skips (sound locks).
 */
export function dayTotals(results: Record<string, LockResult>, seanceInPlay: BoxesInPlay, skip?: ReadonlySet<string>): { souls: number; opened: number } {
  const plays = LOCKS.flatMap((l) => {
    const r = results[l.slug];
    if (skip?.has(l.slug)) return [];
    return r && r.status !== "none" && r.status !== "sealed" ? [{ date: "d", lock: l.slug, souls: r.souls, status: r.status }] : [];
  });
  return foldPlays(plays, boxOf, (_date, box) => inPlayOf(seanceInPlay, box));
}

export function shareDay(opts: {
  number: number; results: Record<string, LockResult>; streak: number; site: string; seanceInPlay?: BoxesInPlay; skip?: ReadonlySet<string>;
}): string {
  const { number, results, streak, site, seanceInPlay = 0, skip } = opts;
  const tablesLine = (id: SeanceBoxId) =>
    seanceLocksOf(id).map((l) => {
      const r = results[l.slug];
      return tableSymbol(r && (r.status === "won" || r.status === "lost") ? { status: r.status, mistakes: r.mistakes ?? 0 } : undefined);
    }).join("");
  const { souls, opened } = dayTotals(results, seanceInPlay, skip);
  const counted = (ls: LockDef[]) => ls.filter((l) => !skip?.has(l.slug));
  const units = VAULT_UNITS.filter((u) => u.kind !== "lock" || !skip?.has(u.lock.slug)).length;
  return [
    `GUESSLOCK #${number} — ${opened}/${units} locks · ${souls} souls`,
    `Spirits  ${counted(SPIRIT_LOCKS).map((l) => symbolFor(results[l.slug])).join("")}`,
    `Shop     ${counted(SHOP_LOCKS).map((l) => symbolFor(results[l.slug])).join("")}`,
    `Omens    ${counted(OMEN_LOCKS).map((l) => symbolFor(results[l.slug], l)).join("")}`,
    `Stars    ${counted(STAR_LOCKS).map((l) => symbolFor(results[l.slug])).join("")}`,
    ...SEANCE_BOX_LIST.filter((b) => inPlayOf(seanceInPlay, b.id) > 0).map((b) => `${b.name.replace("The ", "").padEnd(8)} ${tablesLine(b.id)}`),
    `🔥 ${streak} ${streak === 1 ? "day" : "days"}`,
    site,
  ].join("\n");
}
