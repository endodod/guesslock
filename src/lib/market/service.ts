// The Black Market, server side: balances, opening cases, selling, set bonuses and wearing flair. Accounts only: a
// signed-out player's souls live in their browser and could be edited, so they can't be spent.
import { randomInt } from "node:crypto";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { loadGameData } from "../engine/context";
import {
  CASES, CASE_BY_ID, COSMETIC_BY_KEY, RARITY_ORDER, buildCollectibles, buildSets, casePool, casePreview, expectedValue, rollCase, scrapValue, sellValue,
  type Collectible, type Rarity, type Slot,
} from "./catalog";

export class MarketError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const uniform = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Every collectible, resolved from the current game data (cached; the shop, weapons and map change rarely). */
const cachedCollectibles = unstable_cache(async () => buildCollectibles(await loadGameData()), ["collectibles"], { revalidate: 600, tags: ["catalog"] });
export async function getCollectibles(): Promise<Collectible[]> {
  try {
    return await cachedCollectibles();
  } catch (e) {
    // Scripts (npm run check:market) run outside Next.js, which has no cache to offer: build it directly.
    if (String(e).includes("incrementalCache")) return buildCollectibles(await loadGameData());
    throw e;
  }
}

/** Souls earned (ranked) and spendable. */
export async function balance(userId: string): Promise<{ earned: number; spendable: number }> {
  const [stats, wallet] = await Promise.all([
    db.userStats.findUnique({ where: { userId }, select: { totalSouls: true } }),
    db.wallet.findUnique({ where: { userId }, select: { adjust: true } }),
  ]);
  const earned = stats?.totalSouls ?? 0;
  return { earned, spendable: Math.max(0, earned + (wallet?.adjust ?? 0)) };
}

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** A market transaction. Purchases by one player queue on their wallet row, so give them more time than the default 2 s to start. */
export const marketTx = <T,>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });

/** The wallet row, created race-free (ON CONFLICT DO NOTHING: Prisma's upsert can collide under parallel requests). */
const ensureWallet = (tx: Tx, userId: string) => tx.wallet.createMany({ data: [{ userId }], skipDuplicates: true });

/**
 * Takes `amount` souls if (and only if) the player has them. A single conditional UPDATE, so two parallel purchases can
 * never both spend the same souls. Returns false when the balance is too low.
 */
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

export async function credit(tx: Tx, userId: string, amount: number, reason: string, ref?: string) {
  await ensureWallet(tx, userId);
  await tx.wallet.update({ where: { userId }, data: { adjust: { increment: amount } } });
  await tx.soulLedger.create({ data: { userId, delta: amount, reason, ref } });
}

/** What the browser needs to show a collectible. */
export type ItemView = Collectible & { id: number; obtainedAt: string };

function ownedViews(rows: { id: number; itemKey: string; obtainedAt: Date }[], byKey: Map<string, Collectible>): ItemView[] {
  return rows.flatMap((r) => {
    const c = byKey.get(r.itemKey);
    return c ? [{ ...c, id: r.id, obtainedAt: r.obtainedAt.toISOString() }] : [];
  });
}

/**
 * The shop window: purse, the cases with their odds, and what's inside them. `preview` adds a sample of each case's
 * contents for the opening animation (left out of the answers to purchases, which the page merges into what it has).
 */
export async function marketState(userId: string, preview = true) {
  const [bal, collectibles, profile, ledger] = await Promise.all([
    balance(userId),
    getCollectibles(),
    db.profile.findUnique({ where: { userId }, select: { equippedTitle: true, equippedColor: true, equippedTheme: true, displayName: true } }),
    db.soulLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const owned = new Set((await db.inventoryItem.findMany({ where: { userId }, select: { itemKey: true } })).map((r) => r.itemKey));
  return {
    ...bal,
    name: profile?.displayName ?? "",
    equipped: { title: profile?.equippedTitle ?? null, color: profile?.equippedColor ?? null, theme: profile?.equippedTheme ?? null },
    cases: CASES.map((c) => {
      const pool = casePool(c, collectibles);
      return {
        ...c,
        pool: Object.fromEntries(RARITY_ORDER.map((r) => [r, { total: pool[r].length, owned: pool[r].filter((x) => owned.has(x.key)).length }])) as Record<Rarity, { total: number; owned: number }>,
        ev: Math.round(expectedValue(c, collectibles)),
        preview: preview ? casePreview(c, collectibles) : ([] as Collectible[]),
      };
    }),
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, at: l.createdAt.toISOString() })),
  };
}

/** The collection page: everything owned, the sets with their progress, the purse. */
export async function inventoryState(userId: string) {
  const [bal, collectibles, rows, profile, claims] = await Promise.all([
    balance(userId),
    getCollectibles(),
    db.inventoryItem.findMany({ where: { userId }, orderBy: { obtainedAt: "desc" } }),
    db.profile.findUnique({ where: { userId }, select: { equippedTitle: true, equippedColor: true, equippedTheme: true, displayName: true } }),
    db.soulLedger.findMany({ where: { userId, reason: "set" }, select: { ref: true } }),
  ]);
  const byKey = new Map(collectibles.map((c) => [c.key, c]));
  const items = ownedViews(rows, byKey);
  const have = new Set(items.map((i) => i.key));
  const claimed = new Set(claims.map((c) => c.ref));
  return {
    ...bal,
    name: profile?.displayName ?? "",
    equipped: { title: profile?.equippedTitle ?? null, color: profile?.equippedColor ?? null, theme: profile?.equippedTheme ?? null },
    items,
    worth: items.reduce((a, i) => a + i.value, 0),
    totals: { items: collectibles.length },
    sets: buildSets(collectibles).map((s) => ({
      id: s.id, name: s.name, category: s.category, reward: s.reward, total: s.keys.length, have: s.keys.filter((k) => have.has(k)).length, claimed: claimed.has(s.id),
    })),
  };
}

/** Opens a case: pays, draws one collectible (crypto-random), and scraps a duplicate for part of its value. */
export async function openCase(
  userId: string, caseId: string, rand: () => number = uniform,
): Promise<{ item: Collectible; duplicate: boolean; refund: number; itemId: number | null }> {
  const c = CASE_BY_ID[caseId];
  if (!c) throw new MarketError("Unknown case.", 404);
  const item = rollCase(c, await getCollectibles(), rand(), rand(), rand());
  return marketTx(async (tx) => {
    if (!(await spend(tx, userId, c.price, "case", c.id))) throw new MarketError("Not enough souls.", 402);
    const owned = await tx.inventoryItem.count({ where: { userId, itemKey: item.key } });
    if (owned > 0) {
      const refund = scrapValue(item);
      await credit(tx, userId, refund, "duplicate", item.key);
      return { item, duplicate: true, refund, itemId: null };
    }
    const row = await tx.inventoryItem.create({ data: { userId, itemKey: item.key, source: "case" } });
    return { item, duplicate: false, refund: 0, itemId: row.id };
  });
}

/** Sells an owned item back for part of its value (the row is deleted and paid in one transaction). */
export async function sellItem(userId: string, itemId: number): Promise<{ name: string; souls: number }> {
  const byKey = new Map((await getCollectibles()).map((c) => [c.key, c]));
  return marketTx(async (tx) => {
    const row = await tx.inventoryItem.findFirst({ where: { id: itemId, userId } });
    if (!row) throw new MarketError("You don't own that.", 404);
    const c = byKey.get(row.itemKey);
    if (!c) throw new MarketError("That item is no longer in the catalogue.", 409);
    // Delete first: a second sale of the same row (double click, two tabs) finds nothing to delete.
    const gone = await tx.inventoryItem.deleteMany({ where: { id: itemId, userId } });
    if (gone.count !== 1) throw new MarketError("You don't own that.", 404);
    const souls = sellValue(c);
    await credit(tx, userId, souls, "sell", c.key);
    if (c.kind === "flair" && c.slot) {
      const field = EQUIP_FIELD[c.slot];
      await tx.profile.updateMany({ where: { userId, [field]: c.key }, data: { [field]: null } });
    }
    return { name: c.name, souls };
  });
}

/** Pays a set's bonus once: when every item of it is owned and it hasn't been claimed before. */
export async function claimSet(userId: string, setId: string): Promise<{ name: string; souls: number }> {
  const collectibles = await getCollectibles();
  const set = buildSets(collectibles).find((s) => s.id === setId);
  if (!set) throw new MarketError("Unknown set.", 404);
  return marketTx(async (tx) => {
    // Serialise claims of the same set by the same player, so two parallel requests can't both pay.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`set:${userId}:${setId}`}))`;
    if (await tx.soulLedger.count({ where: { userId, reason: "set", ref: setId } })) throw new MarketError("Already claimed.", 409);
    const owned = new Set((await tx.inventoryItem.findMany({ where: { userId, itemKey: { in: set.keys } }, select: { itemKey: true } })).map((r) => r.itemKey));
    if (set.keys.some((k) => !owned.has(k))) throw new MarketError("The set isn't complete.", 409);
    await credit(tx, userId, set.reward, "set", setId);
    return { name: set.name, souls: set.reward };
  });
}

const EQUIP_FIELD: Record<Slot, "equippedTitle" | "equippedColor" | "equippedTheme"> = { title: "equippedTitle", color: "equippedColor", theme: "equippedTheme" };

/** Equips an owned flair (by key), or clears a slot with key null. */
export async function equip(userId: string, slot: Slot, key: string | null): Promise<void> {
  if (!(slot in EQUIP_FIELD)) throw new MarketError("Unknown slot.");
  if (key !== null) {
    const c = COSMETIC_BY_KEY[key];
    if (!c || c.slot !== slot) throw new MarketError("That doesn't go there.");
    if (!(await db.inventoryItem.count({ where: { userId, itemKey: key } }))) throw new MarketError("You don't own that.", 403);
  }
  await db.profile.update({ where: { userId }, data: { [EQUIP_FIELD[slot]]: key } });
}

/** Equipped title and name colour per player, for the leaderboards. */
export async function cosmeticsOf(userIds: string[]): Promise<Map<string, { title: string | null; color: string | null }>> {
  const rows = await db.profile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, equippedTitle: true, equippedColor: true } });
  return new Map(rows.map((r) => [r.userId, {
    title: (r.equippedTitle && COSMETIC_BY_KEY[r.equippedTitle]?.value) || null,
    color: (r.equippedColor && COSMETIC_BY_KEY[r.equippedColor]?.value) || null,
  }]));
}

/** Total worth (souls) of each player's collection (the Collectors board). */
export async function collectionCounts(): Promise<{ userId: string; value: number }[]> {
  const [rows, collectibles] = await Promise.all([db.inventoryItem.findMany({ select: { userId: true, itemKey: true } }), getCollectibles()]);
  const value = new Map(collectibles.map((c) => [c.key, c.value]));
  const per = new Map<string, number>();
  for (const r of rows) {
    const v = value.get(r.itemKey);
    if (v) per.set(r.userId, (per.get(r.userId) ?? 0) + v);
  }
  return [...per].map(([userId, value]) => ({ userId, value }));
}
