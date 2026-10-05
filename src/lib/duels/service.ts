// Duels, server side: challenges (by name or as an open link), moves checked against the rules in games.ts with an
// optimistic version lock, resignations, 24-hour timeouts, and the soul payout for a win. Each player may pick a hero as
// their playing stone (shown on their pieces): the challenger when challenging, the other player when accepting.
import { randomBytes, randomInt } from "node:crypto";
import { db } from "../db";
import { todayDate } from "../day";
import { nameKey } from "../accounts/rules";
import { credit, marketTx } from "../market/service";
import { getCatalog } from "../engine/catalog";
import { GAMES, type GameId, type Outcome, type Seat } from "./games";
import { DUEL_DAILY_CAP, DUEL_REASON, DUEL_WIN, duelRef, payableWin, type DuelResult } from "./rewards";
import type { Duel, Prisma } from "@/generated/prisma/client";

export class DuelError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** No move for this long: the player to move loses. */
export const MOVE_TIMEOUT_MS = 24 * 3600_000;
/** An unanswered challenge lapses after this long. */
export const INVITE_TTL_MS = 7 * 24 * 3600_000;
/** Open challenges a player may have at once. */
export const MAX_OPEN = 10;

/** A playing stone: the hero shown on a player's pieces. */
export type Stone = { id: number; name: string; icon: string | null };

export type DuelView = {
  id: string; game: GameId; status: string; state: unknown; turn: Seat; moves: number; version: number;
  /** The viewer's seat, or null for a spectator (or someone who may accept). */
  seat: Seat | null;
  players: [{ name: string; stone: Stone | null }, { name: string; stone: Stone | null } | null];
  /** The challenged player's name (a challenge by name). */
  invitee: string | null;
  canAccept: boolean;
  winner: Seat | null; result: DuelResult | null; paid: number;
  /** When the player to move runs out of time (active duels). */
  deadline: string | null;
  createdAt: string;
};

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const newId = () => randomBytes(8).readBigUInt64BE().toString(36).padStart(10, "0").slice(0, 10);
const seatOf = (d: Duel, userId: string | null): Seat | null => (userId && d.playerA === userId ? 0 : userId && d.playerB === userId ? 1 : null);

/** The heroes that can be picked as a stone, by id. */
export async function stones(): Promise<Map<number, Stone>> {
  return new Map((await getCatalog()).hero.map((h) => [Number(h.id), { id: Number(h.id), name: h.name, icon: h.icon }]));
}

/** A picked stone, checked: null for none, an error for a hero that doesn't exist. */
async function checkStone(hero: number | null | undefined): Promise<number | null> {
  if (hero === null || hero === undefined) return null;
  if (!(await stones()).has(hero)) throw new DuelError("Pick a hero from the list.");
  return hero;
}

async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = want.length ? await db.profile.findMany({ where: { userId: { in: want } }, select: { userId: true, displayName: true } }) : [];
  return new Map(rows.map((r) => [r.userId, r.displayName]));
}

function toView(d: Duel, viewer: string | null, n: Map<string, string>, st: Map<number, Stone>): DuelView {
  const seat = seatOf(d, viewer);
  const stone = (hero: number | null) => (hero === null ? null : st.get(hero) ?? null);
  return {
    id: d.id, game: d.game as GameId, status: d.status, state: d.state, turn: d.turn as Seat, moves: d.moves, version: d.version, seat,
    players: [
      { name: n.get(d.playerA) ?? "A player", stone: stone(d.heroA) },
      d.playerB ? { name: n.get(d.playerB) ?? "A player", stone: stone(d.heroB) } : null,
    ],
    invitee: d.invitee ? n.get(d.invitee) ?? "A player" : null,
    canAccept: d.status === "invited" && !!viewer && viewer !== d.playerA && (!d.invitee || d.invitee === viewer),
    winner: d.winner === null ? null : (d.winner as Seat), result: (d.result as DuelResult | null) ?? null, paid: d.paid,
    deadline: d.status === "active" ? new Date(d.lastMoveAt.getTime() + MOVE_TIMEOUT_MS).toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function viewOf(d: Duel, viewer: string | null): Promise<DuelView> {
  const [n, st] = await Promise.all([names([d.playerA, d.playerB, d.invitee]), stones()]);
  return toView(d, viewer, n, st);
}

/** Applies a lapsed deadline (timeout or expired challenge). Returns the current row. */
async function settle(d: Duel): Promise<Duel> {
  const now = Date.now();
  if (d.status === "active" && now - d.lastMoveAt.getTime() > MOVE_TIMEOUT_MS) {
    return finish(d, { winner: other(d.turn as Seat) }, "timeout", {});
  }
  if (d.status === "invited" && now - d.createdAt.getTime() > INVITE_TTL_MS) {
    const r = await db.duel.updateMany({ where: { id: d.id, version: d.version }, data: { status: "expired", version: { increment: 1 } } });
    return r.count ? { ...d, status: "expired", version: d.version + 1 } : (await db.duel.findUnique({ where: { id: d.id } }))!;
  }
  return d;
}

/** Ends a duel (guarded by its version) and pays the winner. */
async function finish(d: Duel, outcome: NonNullable<Outcome>, result: DuelResult, data: Prisma.DuelUpdateManyMutationInput): Promise<Duel> {
  const winner = "winner" in outcome ? outcome.winner : null;
  const r = await db.duel.updateMany({
    where: { id: d.id, version: d.version },
    data: { ...data, status: "done", winner, result: winner === null ? "draw" : result, version: { increment: 1 } },
  });
  if (!r.count) throw new DuelError("The board changed in the meantime. Reload it.", 409);
  let done = (await db.duel.findUnique({ where: { id: d.id } }))!;
  if (winner !== null && done.playerB) {
    const paid = await payWin(done, winner).catch((e) => { console.error("[duels] payout failed", e); return 0; });
    if (paid) done = await db.duel.update({ where: { id: d.id }, data: { paid } });
  }
  return done;
}

/** Credits the winner once per beaten account, game and day, within the daily cap. Returns the souls paid (0 if none). */
async function payWin(d: Duel, winner: Seat): Promise<number> {
  const game = d.game as GameId;
  if (!payableWin({ game, moves: d.moves, result: (d.result ?? "win") as DuelResult })) return 0;
  const winnerId = winner === 0 ? d.playerA : d.playerB!;
  const loserId = winner === 0 ? d.playerB! : d.playerA;
  const today = todayDate();
  const ref = duelRef(game, loserId, today);
  return marketTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`duel:${winnerId}`}))`;
    if (await tx.soulLedger.findFirst({ where: { userId: winnerId, reason: DUEL_REASON, ref } })) return 0;
    const todays = await tx.soulLedger.count({ where: { userId: winnerId, reason: DUEL_REASON, ref: { endsWith: `:${today}` } } });
    if (todays >= DUEL_DAILY_CAP) return 0;
    await credit(tx, winnerId, DUEL_WIN, DUEL_REASON, ref);
    return DUEL_WIN;
  });
}

export async function getDuel(id: string): Promise<Duel | null> {
  const d = await db.duel.findUnique({ where: { id } });
  return d ? settle(d) : null;
}

async function mustGet(id: string): Promise<Duel> {
  const d = await getDuel(id);
  if (!d) throw new DuelError("That duel doesn't exist.", 404);
  return d;
}

export async function createDuel(userId: string, game: GameId, opponent?: string, hero?: number | null): Promise<Duel> {
  const heroA = await checkStone(hero);
  let invitee: string | null = null;
  if (opponent?.trim()) {
    const p = await db.profile.findUnique({ where: { nameKey: nameKey(opponent) }, select: { userId: true } });
    if (!p) throw new DuelError("No player has that name.", 404);
    if (p.userId === userId) throw new DuelError("You can't challenge yourself.");
    invitee = p.userId;
  }
  const open = await db.duel.count({ where: { playerA: userId, status: "invited", createdAt: { gt: new Date(Date.now() - INVITE_TTL_MS) } } });
  if (open >= MAX_OPEN) throw new DuelError(`You have ${MAX_OPEN} open challenges already. Cancel one first.`, 429);
  return db.duel.create({
    data: { id: newId(), game, playerA: userId, invitee, heroA, state: GAMES[game].init() as Prisma.InputJsonValue, turn: randomInt(0, 2) },
  });
}

export async function acceptDuel(id: string, userId: string, hero?: number | null): Promise<Duel> {
  const heroB = await checkStone(hero);
  const d = await mustGet(id);
  if (d.status !== "invited") throw new DuelError("This challenge is no longer open.", 409);
  if (d.playerA === userId) throw new DuelError("You can't accept your own challenge.");
  if (d.invitee && d.invitee !== userId) throw new DuelError("This challenge is for another player.", 403);
  const r = await db.duel.updateMany({
    where: { id, version: d.version, status: "invited" },
    data: { playerB: userId, heroB, status: "active", lastMoveAt: new Date(), version: { increment: 1 } },
  });
  if (!r.count) throw new DuelError("Someone else took this challenge.", 409);
  return (await db.duel.findUnique({ where: { id } }))!;
}

/** The challenger cancels, or the challenged player declines. */
export async function declineDuel(id: string, userId: string): Promise<Duel> {
  const d = await mustGet(id);
  if (d.status !== "invited") throw new DuelError("This challenge is no longer open.", 409);
  if (d.playerA !== userId && d.invitee !== userId) throw new DuelError("Not your challenge.", 403);
  await db.duel.updateMany({ where: { id, version: d.version }, data: { status: "declined", version: { increment: 1 } } });
  return (await db.duel.findUnique({ where: { id } }))!;
}

export async function moveDuel(id: string, userId: string, version: number, raw: unknown): Promise<Duel> {
  const d = await mustGet(id);
  if (d.status !== "active") throw new DuelError("This duel isn't being played.", 409);
  const seat = seatOf(d, userId);
  if (seat === null) throw new DuelError("You're not playing in this duel.", 403);
  if (d.version !== version) throw new DuelError("The board changed in the meantime. Reload it.", 409);
  if (d.turn !== seat) throw new DuelError("It's not your turn.", 409);
  const game = GAMES[d.game as GameId];
  const move = game.parseMove(raw);
  if (!move) throw new DuelError("That move isn't allowed.");
  const r = game.apply(d.state, seat, move);
  if ("error" in r) throw new DuelError(r.error);
  const data = { state: r.state as Prisma.InputJsonValue, turn: r.next, moves: { increment: 1 }, lastMoveAt: new Date() };
  const outcome = game.outcome(r.state, r.next);
  if (outcome) return finish({ ...d, moves: d.moves + 1 }, outcome, "win", data);
  const u = await db.duel.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
  if (!u.count) throw new DuelError("The board changed in the meantime. Reload it.", 409);
  return (await db.duel.findUnique({ where: { id } }))!;
}

export async function resignDuel(id: string, userId: string): Promise<Duel> {
  const d = await mustGet(id);
  if (d.status !== "active") throw new DuelError("This duel isn't being played.", 409);
  const seat = seatOf(d, userId);
  if (seat === null) throw new DuelError("You're not playing in this duel.", 403);
  return finish(d, { winner: other(seat) }, "resign", {});
}

export type DuelLists = { invites: DuelView[]; open: DuelView[]; active: DuelView[]; recent: DuelView[] };

export async function listDuels(userId: string): Promise<DuelLists> {
  const rows = await db.duel.findMany({
    where: { OR: [{ playerA: userId }, { playerB: userId }, { invitee: userId, status: "invited" }] },
    orderBy: { lastMoveAt: "desc" }, take: 80,
  });
  const settled = await Promise.all(rows.map(settle));
  const [n, st] = await Promise.all([names(settled.flatMap((d) => [d.playerA, d.playerB, d.invitee])), stones()]);
  const v = settled.map((d) => toView(d, userId, n, st));
  return {
    invites: v.filter((d) => d.canAccept),
    open: v.filter((d) => d.status === "invited" && d.seat === 0),
    active: v.filter((d) => d.status === "active"),
    recent: v.filter((d) => d.status === "done").slice(0, 20),
  };
}

/** For the header badge: challenges waiting for you and games where it's your move. */
export async function duelBadge(userId: string): Promise<number> {
  const [invites, a, b] = await Promise.all([
    db.duel.count({ where: { invitee: userId, status: "invited", createdAt: { gt: new Date(Date.now() - INVITE_TTL_MS) } } }),
    db.duel.count({ where: { playerA: userId, status: "active", turn: 0 } }),
    db.duel.count({ where: { playerB: userId, status: "active", turn: 1 } }),
  ]);
  return invites + a + b;
}
