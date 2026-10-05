// The Black Market's ways to earn souls, server side: the daily login reward and invitations. Everything is recorded in the
// soul ledger (reasons "daily", "invite-in", "invite-out"), so there is nothing else to store and a claim can be checked
// without a schema change. Claims run in one transaction under an advisory lock, so a double click or two tabs pay once.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { config } from "../config";
import { todayDate } from "../day";
import { dailyReward, claimStreak, INVITE_MAX, INVITE_NEW, INVITE_REFERRER } from "./rewards";
import { MarketError, credit, marketTx, type Tx } from "./service";

// ───────────── daily reward ─────────────

export async function dailyState(userId: string) {
  const rows = await db.soulLedger.findMany({ where: { userId, reason: "daily" }, select: { ref: true }, orderBy: { createdAt: "desc" }, take: 400 });
  const { streak, claimedToday } = claimStreak(rows.flatMap((r) => (r.ref ? [r.ref] : [])), todayDate());
  // What claiming pays (today's reward), or tomorrow's once today's is in.
  const day = streak + 1;
  return { claimedToday, streak, reward: dailyReward(day), day };
}

export async function claimDaily(userId: string): Promise<{ reward: number; streak: number; weekBonus: boolean }> {
  const today = todayDate();
  return marketTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily:${userId}`}))`;
    const rows = await tx.soulLedger.findMany({ where: { userId, reason: "daily" }, select: { ref: true }, orderBy: { createdAt: "desc" }, take: 400 });
    const { streak, claimedToday } = claimStreak(rows.flatMap((r) => (r.ref ? [r.ref] : [])), today);
    if (claimedToday) throw new MarketError("Today's reward is already claimed.", 409);
    const day = streak + 1;
    const reward = dailyReward(day);
    await credit(tx, userId, reward, "daily", today);
    return { reward, streak: day, weekBonus: day % 7 === 0 };
  });
}

// ───────────── invitations ─────────────

// Keyed with a deployment secret. PUZZLE_SALT is not one (its default is in the repository), so anyone could have forged links.
// NEON_AUTH_COOKIE_SECRET stays in the chain so invite links signed before the move to Better Auth keep working.
const inviteKey = () => `${config.sessionSecret || process.env.NEON_AUTH_COOKIE_SECRET || process.env.BETTER_AUTH_SECRET || config.salt}:invite`;
const sign = (userId: string) => createHmac("sha256", inviteKey()).update(userId).digest("base64url").slice(0, 16);

/** The token in a player's invite link: their id and a signature, so a link can be checked without looking anything up. */
export const inviteToken = (userId: string) => `${Buffer.from(userId).toString("base64url")}.${sign(userId)}`;

/** The inviter's id from a token, or null when it was altered. */
export function parseInvite(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig || token.length > 200) return null;
  let userId: string;
  try { userId = Buffer.from(id, "base64url").toString("utf8"); } catch { return null; }
  const want = Buffer.from(sign(userId));
  const got = Buffer.from(sig);
  return userId && want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

/** Who a token comes from (display name), for the invite page; null for an invalid link or an unknown player. */
export async function inviterName(token: string): Promise<{ id: string; name: string } | null> {
  const id = parseInvite(token);
  if (!id) return null;
  const p = await db.profile.findUnique({ where: { userId: id }, select: { displayName: true } });
  return p ? { id, name: p.displayName } : null;
}

const rankedDone = (userId: string) => db.play.count({ where: { userId, source: "live", archive: false, status: { not: "playing" } } });

/** Your invite link's numbers, and (when a link brought you here) whether you can claim its bonus yet. */
export async function inviteState(userId: string, pendingToken?: string | null) {
  const [joined, earned, already, finished] = await Promise.all([
    db.soulLedger.count({ where: { userId, reason: "invite-out" } }),
    db.soulLedger.aggregate({ where: { userId, reason: "invite-out" }, _sum: { delta: true } }),
    db.soulLedger.count({ where: { userId, reason: "invite-in" } }),
    rankedDone(userId),
  ]);
  let pending: { from: string; ready: boolean } | null = null;
  if (pendingToken && !already) {
    const from = await inviterName(pendingToken);
    if (from && from.id !== userId) pending = { from: from.name, ready: finished > 0 };
  }
  return { token: inviteToken(userId), joined, earned: earned._sum.delta ?? 0, max: INVITE_MAX, newBonus: INVITE_NEW, referrerBonus: INVITE_REFERRER, pending };
}

/**
 * Claims an invitation: the invited player (only once, only after finishing a ranked lock) and their inviter (up to
 * INVITE_MAX times) are both paid.
 */
export async function redeemInvite(userId: string, token: string): Promise<{ from: string; souls: number }> {
  const from = await inviterName(token);
  if (!from) throw new MarketError("That invitation isn't valid.", 404);
  if (from.id === userId) throw new MarketError("You can't invite yourself.");
  return marketTx(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite:${userId}`}))`;
    if (await tx.soulLedger.count({ where: { userId, reason: "invite-in" } })) throw new MarketError("You have already claimed an invitation.", 409);
    if ((await tx.play.count({ where: { userId, source: "live", archive: false, status: { not: "playing" } } })) === 0) throw new MarketError("Finish a ranked lock while signed in first, then claim it.", 409);
    if ((await tx.soulLedger.count({ where: { userId: from.id, reason: "invite-out" } })) >= INVITE_MAX) throw new MarketError(`${from.name} has used up their invitations.`, 409);
    await credit(tx, userId, INVITE_NEW, "invite-in", from.id);
    await credit(tx, from.id, INVITE_REFERRER, "invite-out", userId);
    return { from: from.name, souls: INVITE_NEW };
  });
}
