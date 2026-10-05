// What winning a duel pays (pure). A win against an account pays once per day per game, so two friends can't farm each
// other, and a player collects at most DUEL_DAILY_CAP paid wins a day. Like the daily reward, the souls go into the wallet
// only: they never count for the leaderboards.
import { shareOfDay } from "../game/economy";
import { GAMES, type GameId } from "./games";

/** A paid win: 4% of a typical day's income. */
export const DUEL_WIN = shareOfDay(0.04);
/** Paid wins per player and day, across every game and opponent. */
export const DUEL_DAILY_CAP = 5;
export const DUEL_REASON = "duel-win";

/** The ledger ref that makes a win pay once: game, the beaten account, the day. */
export const duelRef = (game: GameId, loserId: string, day: string) => `${game}:${loserId}:${day}`;

export type DuelResult = "win" | "draw" | "resign" | "timeout";

/** Draws never pay; a win, resignation or timeout only once the game had enough moves to be a real one. */
export function payableWin(d: { game: GameId; moves: number; result: DuelResult }): boolean {
  return d.result !== "draw" && d.moves >= GAMES[d.game].minMoves;
}
