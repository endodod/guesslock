// Ways to earn spendable souls besides ranked plays: the daily login reward (with a streak) and inviting friends.
// Pure (shared by server and client). The bonus souls go into the wallet only: they never count towards the souls the
// leaderboards rank by, so nobody climbs a board by logging in or inviting.
import { addDays } from "../time";
import { shareOfDay } from "../game/economy";

/**
 * Day n of a login streak pays 3% of a day's income, 1.5% more each day up to ten days, and every seventh day a quarter of
 * a day on top. All of it a share of what a full day earns (game/economy.ts), so it keeps its weight when the economy moves.
 */
export const DAILY_BASE = shareOfDay(0.03);
export const DAILY_STEP = shareOfDay(0.015);
export const DAILY_MAX_STEPS = 9;
export const DAILY_WEEK_BONUS = shareOfDay(0.25);

export function dailyReward(day: number): number {
  const n = Math.max(1, Math.floor(day));
  return DAILY_BASE + DAILY_STEP * Math.min(n - 1, DAILY_MAX_STEPS) + (n % 7 === 0 ? DAILY_WEEK_BONUS : 0);
}

/**
 * The login streak from the days a reward was claimed: consecutive days ending today, or yesterday while today's is still
 * waiting (then the streak is alive but `claimedToday` is false). 0 when it has been broken.
 */
export function claimStreak(claimedDays: string[], today: string): { streak: number; claimedToday: boolean } {
  const days = new Set(claimedDays);
  const claimedToday = days.has(today);
  let day = claimedToday ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) { streak++; day = addDays(day, -1); }
  return { streak, claimedToday };
}

/** Inviting: the invited player and the one who invited them are both paid once the newcomer has finished a ranked lock. */
export const INVITE_NEW = shareOfDay(0.15);
export const INVITE_REFERRER = shareOfDay(0.25);
/** At most this many paid invitations per player. */
export const INVITE_MAX = 25;

/** The cookie that remembers which invitation brought a visitor (set by the invite page). */
export const INVITE_COOKIE = "gl_ref";
