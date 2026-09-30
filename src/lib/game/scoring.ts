// Souls and share text (pure; unit-tested). Share text never contains clue content.
import { LOCKS, OMEN_LOCKS, SHOP_LOCKS, SPIRIT_LOCKS, type LockDef } from "@/locks.config";
import { omenSymbol } from "../omens/scoring";
import type { Tile } from "../engine/types";

export const BONUS_SOULS = 25;

/** souls = max(10, 100 − 10 × (guesses − 1)) − 15 × hintsUsed, min 10 on a win; 0 on a loss. */
export function soulsFor(result: { won: boolean; guesses: number; hintsUsed: number; bonusCorrect?: boolean }): number {
  if (!result.won) return 0;
  const base = Math.max(10, 100 - 10 * (result.guesses - 1)) - 15 * result.hintsUsed;
  return Math.max(10, base) + (result.bonusCorrect ? BONUS_SOULS : 0);
}

export type LockResult = { status: "won" | "lost" | "playing" | "sealed" | "none"; guesses: number; souls: number };

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

export function shareDay(opts: {
  number: number; results: Record<string, LockResult>; streak: number; site: string;
}): string {
  const { number, results, streak, site } = opts;
  const open = LOCKS.filter((l) => results[l.slug]?.status === "won").length;
  const souls = LOCKS.reduce((a, l) => a + (results[l.slug]?.souls ?? 0), 0);
  return [
    `GUESSLOCK #${number} — ${open}/${LOCKS.length} locks · ${souls} souls`,
    `Spirits  ${SPIRIT_LOCKS.map((l) => symbolFor(results[l.slug])).join("")}`,
    `Shop     ${SHOP_LOCKS.map((l) => symbolFor(results[l.slug])).join("")}`,
    `Omens    ${OMEN_LOCKS.map((l) => symbolFor(results[l.slug], l)).join("")}`,
    `🔥 ${streak} ${streak === 1 ? "day" : "days"}`,
    site,
  ].join("\n");
}
