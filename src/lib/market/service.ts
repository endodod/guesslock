// The Black Market, server side: balances, opening cases, selling, set bonuses and wearing flair. Accounts only: a
// signed-out player's souls live in their browser and could be edited, so they can't be spent.
import { randomInt } from "node:crypto";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { loadGameData } from "../engine/context";
import {
  CASES, CASE_BY_ID, COSMETIC_BY_KEY, RARITY_ORDER, buildCollectibles, buildSets, casePool, casePreview, collectorsCrate, crateRarity, expectedValue, rollCase,
  sellPrice, sparesPrice, type Collectible, type Rarity, type Slot,
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

/** What the browser needs to show a collectible: one entry per item owned, with how many copies of it. */
export type ItemView = Collectible & { id: number; obtainedAt: string; copies: number };

/** Rows (one per copy) folded into one stack per key. `id` is the newest copy: the one a sale takes first, so the oldest stays. */
function ownedViews(rows: { id: number; itemKey: string; obtainedAt: Date }[], byKey: Map<string, Collectible>): ItemView[] {
  const stacks = new Map<string, ItemView>();
  for (const r of rows) {
    const c = byKey.get(r.itemKey);
    if (!c) continue;
    const at = stacks.get(r.itemKey);
    if (!at) stacks.set(r.itemKey, { ...c, id: r.id, obtainedAt: r.obtainedAt.toISOString(), copies: 1 });
    else { at.copies++; if (r.id > at.id) at.id = r.id; }
  }
  return [...stacks.values()].sort((a, b) => (a.obtainedAt < b.obtainedAt ? 1 : a.obtainedAt > b.obtainedAt ? -1 : b.id - a.id));
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
    crates: RARITY_ORDER.map((r) => {
      const { pool, ...crate } = collectorsCrate(r, collectibles, owned);
      // A sample of what is still missing, for the opening animation (like a case's preview).
      const step = Math.max(1, pool.length / 12);
      return { ...crate, preview: preview ? Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[Math.floor(i * step)]) : ([] as Collectible[]) };
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
    // The collection is worth one copy of each item; spares are counted separately, at what they sell for.
    worth: items.reduce((a, i) => a + i.value, 0),
    spares: items.reduce((a, i) => a + sparesPrice(i, i.copies), 0),
    totals: { items: collectibles.length },
    sets: buildSets(collectibles).map((s) => ({
      id: s.id, name: s.name, category: s.category, reward: s.reward, total: s.keys.length, have: s.keys.filter((k) => have.has(k)).length, claimed: claimed.has(s.id),
    })),
  };
}

/** Opens a case: pays and draws one collectible (crypto-random). A duplicate is kept as a spare copy, never scrapped. */
export async function openCase(
  userId: string, caseId: string, rand: () => number = uniform,
): Promise<{ item: Collectible; duplicate: boolean; copies: number; itemId: number }> {
  const c = CASE_BY_ID[caseId];
  if (!c) throw new MarketError("Unknown case.", 404);
  const item = rollCase(c, await getCollectibles(), rand(), rand(), rand());
  return marketTx(async (tx) => {
    if (!(await spend(tx, userId, c.price, "case", c.id))) throw new MarketError("Not enough souls.", 402);
    const row = await tx.inventoryItem.create({ data: { userId, itemKey: item.key, source: "case" } });
    const copies = await tx.inventoryItem.count({ where: { userId, itemKey: item.key } });
    return { item, duplicate: copies > 1, copies, itemId: row.id };
  });
}

/**
 * Buys a Collector's Crate: one random collectible of the tier's rarity that the player doesn't own. The price is the
 * server's, worked out here from what is missing; `expectedPrice` is what the browser showed, and a mismatch (something was
 * collected meanwhile) refuses the purchase so nobody pays more than they saw. Purchases by one player queue on an advisory
 * lock, so two parallel ones can't both deliver the same item.
 */
export async function openCrate(
  userId: string, crateId: string, expectedPrice: number, rand: () => number = uniform,
): Promise<{ item: Collectible; duplicate: boolean; copies: number; itemId: number; price: number }> {
  const rarity = crateRarity(crateId);
  if (!rarity) throw new MarketError("Unknown crate.", 404);
  const all = await getCollectibles();
  const roll = rand();
  return marketTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crate:${userId}`}))`;
    const owned = new Set((await tx.inventoryItem.findMany({ where: { userId }, select: { itemKey: true } })).map((r) => r.itemKey));
    const crate = collectorsCrate(rarity, all, owned);
    if (!crate.pool.length) throw new MarketError(`You own every ${rarity} collectible.`, 409);
    if (crate.price !== expectedPrice) throw new MarketError(`The price is now ${crate.price} souls. Look again and confirm.`, 409);
    if (!(await spend(tx, userId, crate.price, "crate-missing", crate.id))) throw new MarketError("Not enough souls.", 402);
    const item = crate.pool[Math.min(crate.pool.length - 1, Math.floor(roll * crate.pool.length))];
    const row = await tx.inventoryItem.create({ data: { userId, itemKey: item.key, source: "crate" } });
    return { item, duplicate: false, copies: 1, itemId: row.id, price: crate.price };
  });
}

/** Takes flair off its slot once the last copy is gone. */
async function unequipIfGone(tx: Tx, userId: string, c: Collectible) {
  if (c.kind !== "flair" || !c.slot) return;
  if (await tx.inventoryItem.count({ where: { userId, itemKey: c.key } })) return;
  const field = EQUIP_FIELD[c.slot];
  await tx.profile.updateMany({ where: { userId, [field]: c.key }, data: { [field]: null } });
}

/**
 * Sells one copy of an owned item (the row is deleted and paid in one transaction). The price depends on how many copies
 * are owned: the last copy pays the base rate, a spare pays more (see `sellPrice`).
 */
export async function sellItem(userId: string, itemId: number): Promise<{ name: string; souls: number }> {
  const byKey = new Map((await getCollectibles()).map((c) => [c.key, c]));
  return marketTx(async (tx) => {
    const row = await tx.inventoryItem.findFirst({ where: { id: itemId, userId } });
    if (!row) throw new MarketError("You don't own that.", 404);
    const c = byKey.get(row.itemKey);
    if (!c) throw new MarketError("That item is no longer in the catalogue.", 409);
    // Sales of one stack queue, so two parallel sales are never priced as the same copy.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stack:${userId}:${c.key}`}))`;
    // Delete first: a second sale of the same row (double click, two tabs) finds nothing to delete.
    const gone = await tx.inventoryItem.deleteMany({ where: { id: itemId, userId } });
    if (gone.count !== 1) throw new MarketError("You don't own that.", 404);
    const copies = (await tx.inventoryItem.count({ where: { userId, itemKey: c.key } })) + 1;
    const souls = sellPrice(c, copies);
    await credit(tx, userId, souls, "sell", c.key);
    await unequipIfGone(tx, userId, c);
    return { name: c.name, souls };
  });
}

/** Sells every copy of an item beyond the first (the oldest stays) in one transaction. */
export async function sellSpares(userId: string, itemKey: string): Promise<{ name: string; souls: number; sold: number }> {
  const c = (await getCollectibles()).find((x) => x.key === itemKey);
  if (!c) throw new MarketError("That item is no longer in the catalogue.", 409);
  return marketTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stack:${userId}:${c.key}`}))`;
    const rows = await tx.inventoryItem.findMany({ where: { userId, itemKey: c.key }, orderBy: { id: "asc" }, select: { id: true } });
    if (rows.length < 2) throw new MarketError("You have no spare copies of that.", 409);
    const spares = rows.slice(1).map((r) => r.id);
    const gone = await tx.inventoryItem.deleteMany({ where: { userId, id: { in: spares } } });
    if (gone.count !== spares.length) throw new MarketError("Your stack changed. Try again.", 409);
    const souls = sparesPrice(c, rows.length);
    await credit(tx, userId, souls, "sell-spares", c.key);
    return { name: c.name, souls, sold: spares.length };
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
  // Distinct items only: a spare copy doesn't move you up the Collectors board.
  const seen = new Set<string>();
  for (const r of rows) {
    const v = value.get(r.itemKey);
    const id = `${r.userId}|${r.itemKey}`;
    if (v && !seen.has(id)) { seen.add(id); per.set(r.userId, (per.get(r.userId) ?? 0) + v); }
  }
  return [...per].map(([userId, value]) => ({ userId, value }));
}
