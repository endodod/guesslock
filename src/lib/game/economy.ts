// The soul economy in one place: what a typical player earns in a day, and everything the Black Market charges or pays
// as a share of it. Pure (shared by server and client). Change an assumption here and prices, item values, set bonuses
// and the daily and invite rewards all follow.
import { VAULT_UNITS } from "@/locks.config";

/** A typical player: the average guesses and hints per puzzle (from the guesses-to-souls curve in game/scoring.ts). */
export const TYPICAL = { guesses: 3.5, hints: 0.3 };

/** Souls of a typical play on the base scale: 100 minus 10 per extra guess, minus 15 per hint. */
const typicalBase = () => Math.max(10, 100 - 10 * (TYPICAL.guesses - 1)) - 15 * TYPICAL.hints;

/** Locks with their own scoring, and what a typical player takes from them (before the lock's weight). */
const TYPICAL_SPECIAL: Record<string, number> = {
  decoy: 62, // 100 / 50 / 25 over three picks
  cache: 60, // 100 / 75 / 50 / 25 over four tries
  constellation: 70, // 10 per cell, 10 for a full grid
  crossword: 75, // the share of words solved, minus 10 per wrong check
  clash: 55, beast: 55, rift: 55, // an Omen is scored out of 100
};
/** A sorting box is worth the average of its tables. */
const TYPICAL_BOX = 65;

/** What a typical player earns by finishing every lock of a day (normal puzzles, no hard mode, no bonus rounds). */
export function expectedDailySouls(): number {
  return VAULT_UNITS.reduce((sum, u) => {
    if (u.kind === "seance") return sum + TYPICAL_BOX;
    return sum + (TYPICAL_SPECIAL[u.lock.slug] ?? typicalBase()) * (u.lock.soulsWeight ?? 1);
  }, 0);
}

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/** A full day, rounded: the yardstick everything below is a share of. A Cursed Vault costs about this much. */
export const DAILY_INCOME = round10(expectedDailySouls());

/** The income the Black Market's base values and prices were authored for (a Cursed Vault was 560 souls). */
export const AUTHORED_FOR = 560;
/** How much bigger than the authored values everything is today. */
export const VALUE_SCALE = DAILY_INCOME / AUTHORED_FOR;

/** A value on the authored scale, brought to today's economy (steps of 5). */
export const scaleValue = (authored: number) => Math.max(5, Math.round((authored * VALUE_SCALE) / 5) * 5);
/** A case price on the authored scale, brought to today's economy (steps of 10). */
export const scalePrice = (authored: number) => round10(authored * VALUE_SCALE);
/** A share of a day's income, rounded to 10. */
export const shareOfDay = (share: number) => round10(DAILY_INCOME * share);
