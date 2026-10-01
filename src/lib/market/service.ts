// The Black Market, server side: balances, opening cases, equipping, trading. Accounts only: a signed-out player's souls
// live in their browser and could be edited, so they can't be spent.
import { randomInt } from "node:crypto";
import { db } from "../db";
import { nameKey } from "../accounts/rules";
import {
  CASE_BY_ID, COSMETIC_BY_KEY, DUPLICATE_REFUND, TRADE_MAX_ITEMS, TRADE_MAX_OPEN, TRADE_MAX_SOULS, rollCase,
  type Cosmetic, type Slot,
} from "./catalog";

export class MarketError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const uniform = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Souls earned (ranked) and spendable. */
export async function balance(userId: string): Promise<{ earned: number; spendable: number }> {
  const [stats, wallet] = await Promise.all([
    db.userStats.findUnique({ where: { userId }, select: { totalSouls: true } }),
    db.wallet.findUnique({ where: { userId }, select: { adjust: true } }),
  ]);
  const earned = stats?.totalSouls ?? 0;
  return { earned, spendable: Math.max(0, earned + (wallet?.adjust ?? 0)) };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Takes `amount` souls if (and only if) the player has them. A single conditional UPDATE, so two parallel purchases can
 * never both spend the same souls. Returns false when the balance is too low.
 */
/** The wallet row, created race-free (ON CONFLICT DO NOTHING: Prisma's upsert can collide under parallel requests). */
const ensureWallet = (tx: Tx, userId: string) => tx.wallet.createMany({ data: [{ userId }], skipDuplicates: true });

async function spend(tx: Tx, userId: string, amount: number, reason: string, ref?: string): Promise<boolean> {
  await ensureWallet(tx, userId);
  const n = await tx.$executeRaw`
    UPDATE "Wallet" w SET "adjust" = w."adjust" - ${amount}, "updatedAt" = now()
    WHERE w."userId" = ${userId}
      AND COALESCE((SELECT s."totalSouls" FROM "UserStats" s WHERE s."userId" = ${userId}), 0) + w."adjust" >= ${amount}`;
  if (n !== 1) return false;
  await tx.soulLedger.create({ data: { userId, delta: -amount, reason, ref } });
  return true;
}

async function credit(tx: Tx, userId: string, amount: number, reason: string, ref?: string) {
  await ensureWallet(tx, userId);
  await tx.wallet.update({ where: { userId }, data: { adjust: { increment: amount } } });
  await tx.soulLedger.create({ data: { userId, delta: amount, reason, ref } });
}

export async function marketState(userId: string) {
  const [bal, items, profile, incoming, outgoing, ledger] = await Promise.all([
    balance(userId),
    db.inventoryItem.findMany({ where: { userId }, orderBy: { obtainedAt: "desc" } }),
    db.profile.findUnique({ where: { userId }, select: { equippedTitle: true, equippedColor: true, equippedTheme: true, displayName: true } }),
    db.tradeOffer.findMany({ where: { toUser: userId, status: "open" }, orderBy: { createdAt: "desc" } }),
    db.tradeOffer.findMany({ where: { fromUser: userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.soulLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const names = await namesOf([...incoming.map((o) => o.fromUser), ...outgoing.map((o) => o.toUser)]);
  const allItemIds = [...incoming, ...outgoing].flatMap((o) => [...o.giveItems, ...o.wantItems]);
  const offerItems = new Map((await db.inventoryItem.findMany({ where: { id: { in: allItemIds } } })).map((i) => [i.id, i.itemKey]));
  const view = (o: (typeof incoming)[number]) => ({
    id: o.id, from: names.get(o.fromUser) ?? "?", to: names.get(o.toUser) ?? "?", status: o.status, message: o.message,
    give: o.giveItems.map((id) => ({ id, key: offerItems.get(id) ?? null })), giveSouls: o.giveSouls,
    want: o.wantItems.map((id) => ({ id, key: offerItems.get(id) ?? null })), wantSouls: o.wantSouls,
    createdAt: o.createdAt.toISOString(),
  });
  return {
    ...bal,
    name: profile?.displayName ?? "",
    equipped: { title: profile?.equippedTitle ?? null, color: profile?.equippedColor ?? null, theme: profile?.equippedTheme ?? null },
    items: items.map((i) => ({ id: i.id, key: i.itemKey, source: i.source, obtainedAt: i.obtainedAt.toISOString() })),
    incoming: incoming.map(view),
    outgoing: outgoing.map(view),
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, at: l.createdAt.toISOString() })),
  };
}

async function namesOf(ids: string[]) {
  const rows = await db.profile.findMany({ where: { userId: { in: [...new Set(ids)] } }, select: { userId: true, displayName: true } });
  return new Map(rows.map((r) => [r.userId, r.displayName]));
}

/** Opens a case: pays, draws one cosmetic (crypto-random), and refunds part of the price for a duplicate. */
export async function openCase(userId: string, caseId: string, rand: () => number = uniform): Promise<{ item: Cosmetic; duplicate: boolean; refund: number; itemId: number | null }> {
  const c = CASE_BY_ID[caseId];
  if (!c) throw new MarketError("Unknown case.", 404);
  const item = rollCase(c, rand(), rand());
  return db.$transaction(async (tx) => {
    if (!(await spend(tx, userId, c.price, "case", c.id))) throw new MarketError("Not enough souls.", 402);
    const owned = await tx.inventoryItem.count({ where: { userId, itemKey: item.key } });
    if (owned > 0) {
      const refund = Math.round(c.price * DUPLICATE_REFUND);
      await credit(tx, userId, refund, "duplicate", item.key);
      return { item, duplicate: true, refund, itemId: null };
    }
    const row = await tx.inventoryItem.create({ data: { userId, itemKey: item.key, source: "case" } });
    return { item, duplicate: false, refund: 0, itemId: row.id };
  });
}

const EQUIP_FIELD: Record<Slot, "equippedTitle" | "equippedColor" | "equippedTheme"> = { title: "equippedTitle", color: "equippedColor", theme: "equippedTheme" };

/** Equips an owned cosmetic (by key), or clears a slot with key null. */
export async function equip(userId: string, slot: Slot, key: string | null): Promise<void> {
  if (!(slot in EQUIP_FIELD)) throw new MarketError("Unknown slot.");
  if (key !== null) {
    const c = COSMETIC_BY_KEY[key];
    if (!c || c.slot !== slot) throw new MarketError("That doesn't go there.");
    if (!(await db.inventoryItem.count({ where: { userId, itemKey: key } }))) throw new MarketError("You don't own that.", 403);
  }
  await db.profile.update({ where: { userId }, data: { [EQUIP_FIELD[slot]]: key } });
}

/** Clears equipped cosmetics the player no longer owns (after a trade). */
async function unequipMissing(tx: Tx, userId: string) {
  const p = await tx.profile.findUnique({ where: { userId } });
  if (!p) return;
  const owned = new Set((await tx.inventoryItem.findMany({ where: { userId }, select: { itemKey: true } })).map((i) => i.itemKey));
  const clear: Record<string, null> = {};
  for (const f of ["equippedTitle", "equippedColor", "equippedTheme"] as const) if (p[f] && !owned.has(p[f]!)) clear[f] = null;
  if (Object.keys(clear).length) await tx.profile.update({ where: { userId }, data: clear });
}

export type OfferInput = { to: string; giveItems: number[]; giveSouls: number; wantItems: number[]; wantSouls: number; message?: string };

/** Offers a trade to another player (by display name). Nothing moves until they accept. */
export async function createOffer(userId: string, o: OfferInput): Promise<{ id: number }> {
  const target = await db.profile.findUnique({ where: { nameKey: nameKey(o.to.trim()) }, select: { userId: true } });
  if (!target) throw new MarketError("No player by that name.", 404);
  if (target.userId === userId) throw new MarketError("You can't trade with yourself.");
  const clean = (ids: number[]) => [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  const give = clean(o.giveItems), want = clean(o.wantItems);
  if (give.length > TRADE_MAX_ITEMS || want.length > TRADE_MAX_ITEMS) throw new MarketError(`At most ${TRADE_MAX_ITEMS} items each way.`);
  for (const s of [o.giveSouls, o.wantSouls]) if (!Number.isInteger(s) || s < 0 || s > TRADE_MAX_SOULS) throw new MarketError(`Souls must be 0 to ${TRADE_MAX_SOULS}.`);
  if (!give.length && !want.length && !o.giveSouls && !o.wantSouls) throw new MarketError("Offer something.");
  if (o.giveSouls && o.wantSouls) throw new MarketError("Souls can only go one way in a trade.");
  if ((await db.inventoryItem.count({ where: { id: { in: give }, userId } })) !== give.length) throw new MarketError("You don't own all of those items.", 403);
  if ((await db.inventoryItem.count({ where: { id: { in: want }, userId: target.userId } })) !== want.length) throw new MarketError("They don't own all of those items.");
  if ((await db.tradeOffer.count({ where: { fromUser: userId, status: "open" } })) >= TRADE_MAX_OPEN) throw new MarketError(`You already have ${TRADE_MAX_OPEN} open offers.`, 429);
  if (o.giveSouls && (await balance(userId)).spendable < o.giveSouls) throw new MarketError("Not enough souls.", 402);
  const row = await db.tradeOffer.create({
    data: { fromUser: userId, toUser: target.userId, giveItems: give, giveSouls: o.giveSouls, wantItems: want, wantSouls: o.wantSouls, message: o.message?.slice(0, 140) || null },
  });
  return { id: row.id };
}

/**
 * Accepts, declines or cancels an offer. Accepting re-checks everything inside one transaction (items still owned,
 * souls still there) and moves it all at once, or nothing: a stale offer is marked failed.
 */
export async function respondOffer(userId: string, id: number, action: "accept" | "decline" | "cancel"): Promise<{ status: string }> {
  const offer = await db.tradeOffer.findUnique({ where: { id } });
  if (!offer || (offer.toUser !== userId && offer.fromUser !== userId)) throw new MarketError("No such offer.", 404);
  if (offer.status !== "open") throw new MarketError("That offer is closed.", 409);
  if (action === "cancel" && offer.fromUser !== userId) throw new MarketError("Only the sender can cancel.", 403);
  if ((action === "accept" || action === "decline") && offer.toUser !== userId) throw new MarketError("Only the receiver can answer.", 403);
  if (action !== "accept") {
    await db.tradeOffer.update({ where: { id }, data: { status: action === "cancel" ? "cancelled" : "declined", resolvedAt: new Date() } });
    return { status: action === "cancel" ? "cancelled" : "declined" };
  }
  try {
    await db.$transaction(async (tx) => {
      // Claim the offer first: a second accept (double click, two tabs) finds it no longer open.
      const claimed = await tx.tradeOffer.updateMany({ where: { id, status: "open" }, data: { status: "accepted", resolvedAt: new Date() } });
      if (claimed.count !== 1) throw new MarketError("That offer is closed.", 409);
      const moveItems = async (ids: number[], from: string, to: string) => {
        if (!ids.length) return;
        const moved = await tx.inventoryItem.updateMany({ where: { id: { in: ids }, userId: from }, data: { userId: to, source: "trade" } });
        if (moved.count !== ids.length) throw new MarketError("Some items in the offer changed hands meanwhile.", 409);
      };
      await moveItems(offer.giveItems, offer.fromUser, offer.toUser);
      await moveItems(offer.wantItems, offer.toUser, offer.fromUser);
      const ref = `trade:${id}`;
      if (offer.giveSouls) {
        if (!(await spend(tx, offer.fromUser, offer.giveSouls, "trade-out", ref))) throw new MarketError("The sender no longer has those souls.", 409);
        await credit(tx, offer.toUser, offer.giveSouls, "trade-in", ref);
      }
      if (offer.wantSouls) {
        if (!(await spend(tx, offer.toUser, offer.wantSouls, "trade-out", ref))) throw new MarketError("You don't have enough souls.", 402);
        await credit(tx, offer.fromUser, offer.wantSouls, "trade-in", ref);
      }
      await unequipMissing(tx, offer.fromUser);
      await unequipMissing(tx, offer.toUser);
    });
  } catch (e) {
    if (e instanceof MarketError && e.status === 409 && e.message !== "That offer is closed.") {
      await db.tradeOffer.update({ where: { id }, data: { status: "failed", resolvedAt: new Date() } });
    }
    throw e;
  }
  return { status: "accepted" };
}

/** Equipped title and name colour per player, for the leaderboards. */
export async function cosmeticsOf(userIds: string[]): Promise<Map<string, { title: string | null; color: string | null }>> {
  const rows = await db.profile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, equippedTitle: true, equippedColor: true } });
  return new Map(rows.map((r) => [r.userId, {
    title: (r.equippedTitle && COSMETIC_BY_KEY[r.equippedTitle]?.value) || null,
    color: (r.equippedColor && COSMETIC_BY_KEY[r.equippedColor]?.value) || null,
  }]));
}

/** Distinct cosmetics owned per player (the Collectors board). */
export async function collectionCounts(): Promise<{ userId: string; value: number }[]> {
  const rows = await db.inventoryItem.groupBy({ by: ["userId", "itemKey"] });
  const per = new Map<string, number>();
  for (const r of rows) if (COSMETIC_BY_KEY[r.itemKey]) per.set(r.userId, (per.get(r.userId) ?? 0) + 1);
  return [...per].map(([userId, value]) => ({ userId, value }));
}

/** A player's collection by display name (shown to anyone signed in, like a profile), or null. */
export async function collectionOf(name: string): Promise<{ id: number; key: string }[] | null> {
  const p = await db.profile.findUnique({ where: { nameKey: nameKey(name.trim()) }, select: { userId: true } });
  if (!p) return null;
  return (await db.inventoryItem.findMany({ where: { userId: p.userId }, orderBy: { obtainedAt: "desc" } })).map((i) => ({ id: i.id, key: i.itemKey }));
}
