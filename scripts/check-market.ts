// Usage: npm run check:market — integration check of the Black Market against the configured database (creates and
// removes two throwaway profiles, "u-a" and "u-b"). Never run it against production.
import "dotenv/config";
if (/neon\.tech/.test(process.env.DATABASE_URL ?? "") && !process.argv.includes("--yes")) { console.error("Refusing to run against a Neon database without --yes."); process.exit(1); }
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { balance, claimSet, collectionCounts, equip, getCollectibles, inventoryState, marketState, openCase, openCrate, sellItem, sellSpares, MarketError } from "../src/lib/market/service";
import { CASE_BY_ID, collectorsCrate, sellPrice, sparesPrice, SELL_RATE } from "../src/lib/market/catalog";
import { claimDaily, dailyState, inviteState, inviteToken, redeemInvite } from "../src/lib/market/earn";
import { INVITE_NEW, INVITE_REFERRER, dailyReward } from "../src/lib/market/rewards";

const USERS = ["u-a", "u-b"];
const CRATE = CASE_BY_ID.scrapheap.price;
const cleanup = async () => {
  for (const id of USERS) {
    await db.profile.deleteMany({ where: { userId: id } });
    await db.userStats.deleteMany({ where: { userId: id } });
    await db.soulLedger.deleteMany({ where: { userId: id } });
    await db.play.deleteMany({ where: { userId: id } });
  }
};

(async () => {
  await cleanup();
  for (const [id, name, souls] of [["u-a", "Alice Test", CRATE * 5 + 30], ["u-b", "Bob Test", 50]] as const) {
    await db.profile.create({ data: { userId: id, displayName: name, nameKey: name.toLowerCase() } });
    await db.userStats.create({ data: { userId: id, totalSouls: souls } });
  }
  const all = await getCollectibles();
  const by = (key: string) => all.find((c) => c.key === key)!;
  // 8 parallel scrapheap crates on enough souls for five (the pool holds 10 connections): never overspends.
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => openCase("u-a", "scrapheap")));
  const ok = r.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openCase>>>[];
  const b = await balance("u-a");
  console.log("opened", ok.length, "balance", b);
  assert.equal(ok.length, 5);
  assert.equal(b.earned, CRATE * 5 + 30);
  assert.equal(b.spendable, 30); // nothing comes back: a duplicate is kept, not scrapped
  for (const x of r) if (x.status === "rejected" && !(x.reason instanceof MarketError)) console.log("unexpected rejection:", String(x.reason).slice(0, 300));
  assert.ok(r.filter((x) => x.status === "rejected").every((x) => (x.reason as unknown) instanceof MarketError));
  // Every draw is kept as a row; a duplicate is a stack with the right count.
  const rows = await db.inventoryItem.findMany({ where: { userId: "u-a" } });
  assert.equal(rows.length, 5);
  const inv0 = await inventoryState("u-a");
  assert.equal(inv0.items.reduce((a, i) => a + i.copies, 0), 5);
  assert.equal(inv0.items.length, new Set(rows.map((x) => x.itemKey)).size);
  for (const x of ok) assert.equal(x.value.duplicate, x.value.copies > 1);

  // A stack of three, made on purpose: a spare sells for the spare rate, the last copy for the base rate.
  const stackKey = "map:trooper";
  const trooper = by(stackKey);
  await db.inventoryItem.deleteMany({ where: { userId: "u-a", itemKey: stackKey } });
  await db.inventoryItem.createMany({ data: [1, 2, 3].map(() => ({ userId: "u-a", itemKey: stackKey, source: "case" })) });
  const stack = (await inventoryState("u-a")).items.find((i) => i.key === stackKey)!;
  assert.equal(stack.copies, 3);
  const w0 = (await balance("u-a")).spendable;
  const s1 = await sellItem("u-a", stack.id); // three owned: the second spare
  assert.equal(s1.souls, sellPrice(trooper, 3));
  assert.ok(s1.souls > sellPrice(trooper, 1));
  const left = await inventoryState("u-a");
  assert.equal(left.items.find((i) => i.key === stackKey)!.copies, 2);
  assert.ok(left.spares >= sparesPrice(trooper, 2));
  const s2 = await sellSpares("u-a", stackKey); // two owned: the first spare, the last copy stays
  assert.equal(s2.sold, 1);
  assert.equal(s2.souls, sellPrice(trooper, 2));
  await assert.rejects(sellSpares("u-a", stackKey), /spare/);
  assert.equal((await balance("u-a")).spendable, w0 + s1.souls + s2.souls);
  const last = (await inventoryState("u-a")).items.find((i) => i.key === stackKey)!;
  assert.equal(last.copies, 1);
  const s3 = await sellItem("u-a", last.id); // the last copy: the base rate
  assert.equal(s3.souls, Math.round(trooper.value * SELL_RATE));
  await assert.rejects(sellItem("u-a", last.id), /own/); // the same row twice
  assert.equal((await inventoryState("u-a")).items.find((i) => i.key === stackKey), undefined);
  // Someone else's item can't be sold.
  const inv = await inventoryState("u-a");
  await assert.rejects(sellItem("u-b", inv.items[0].id), /own/);
  // The Collectors board counts distinct items: a spare adds nothing.
  const countOf = async () => (await collectionCounts()).find((x) => x.userId === "u-a")?.value ?? 0;
  const before = await countOf();
  await db.inventoryItem.create({ data: { userId: "u-a", itemKey: inv.items[0].key, source: "case" } });
  assert.equal(await countOf(), before);

  // Collector's Crates: the price is the server's, a wrong price is refused, and what comes out is never owned.
  await db.userStats.update({ where: { userId: "u-a" }, data: { totalSouls: 1_000_000 } });
  const ownedKeys = async () => new Set((await db.inventoryItem.findMany({ where: { userId: "u-a" }, select: { itemKey: true } })).map((x) => x.itemKey));
  const common = collectorsCrate("common", all, await ownedKeys());
  await assert.rejects(openCrate("u-a", "missing:common", common.price - 10), /price/);
  await assert.rejects(openCrate("u-a", "missing:mythic", 1), /Unknown/);
  const had = await ownedKeys();
  const pay0 = (await balance("u-a")).spendable;
  const got = await openCrate("u-a", "missing:common", common.price);
  assert.equal(got.price, common.price);
  assert.equal(got.item.rarity, "common");
  assert.equal(had.has(got.item.key), false);
  assert.equal(got.duplicate, false);
  assert.equal((await balance("u-a")).spendable, pay0 - common.price);
  // Parallel purchases never deliver the same item twice or take more than the price: each one is a fresh item and
  // pays the price of the moment (a purchase made at a stale price is refused).
  const had2 = await ownedKeys();
  const par = await Promise.allSettled(Array.from({ length: 4 }, () => openCrate("u-a", "missing:common", collectorsCrate("common", all, had2).price)));
  const bought = par.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openCrate>>>[];
  assert.ok(bought.length >= 1);
  assert.equal(new Set(bought.map((x) => x.value.item.key)).size, bought.length);
  for (const x of bought) assert.equal(had2.has(x.value.item.key), false);
  assert.ok(par.filter((x) => x.status === "rejected").every((x) => (x.reason as unknown) instanceof MarketError));
  const after = await ownedKeys();
  assert.equal(after.size, had2.size + bought.length);
  // The market window reports the crates with what is missing.
  const ms = await marketState("u-a", false);
  const mc = ms.crates.find((c) => c.id === "missing:common")!;
  assert.equal(mc.missing, collectorsCrate("common", all, after).missing);
  assert.equal(mc.price, collectorsCrate("common", all, after).price);

  // Flair can be worn when owned, and not when it isn't.
  const flair = inv.items.find((i) => i.kind === "flair" && i.slot);
  if (flair) {
    await equip("u-a", flair.slot!, flair.key);
    await assert.rejects(equip("u-b", flair.slot!, flair.key));
  }
  // An incomplete set can't be claimed.
  await assert.rejects(claimSet("u-a", "map:all"), /complete/);
  const st = await marketState("u-a");
  console.log("state ok", st.spendable, st.cases.length, st.crates.length, st.ledger.length);
  // Daily reward: once a day, 20 souls on day 1, and a parallel double click pays once.
  const wallet0 = (await balance("u-b")).spendable;
  const claims = await Promise.allSettled([claimDaily("u-b"), claimDaily("u-b"), claimDaily("u-b")]);
  assert.equal(claims.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await balance("u-b")).spendable, wallet0 + dailyReward(1));
  const ds = await dailyState("u-b");
  assert.equal(ds.claimedToday, true);
  assert.equal(ds.streak, 1);
  await assert.rejects(claimDaily("u-b"), /already/);
  // Invitations: not before a ranked lock is finished, never your own link, paid to both once.
  const tokenA = inviteToken("u-a");
  await assert.rejects(redeemInvite("u-b", tokenA), /ranked/);
  await assert.rejects(redeemInvite("u-a", tokenA), /yourself/);
  await db.play.create({ data: { userId: "u-b", date: "2026-01-01", lock: "reckoning", guesses: ["1"], status: "won", souls: 100, source: "live", archive: false } });
  assert.equal((await inviteState("u-b", tokenA)).pending?.ready, true);
  const beforeA = (await balance("u-a")).spendable, beforeB = (await balance("u-b")).spendable;
  const paid = await Promise.allSettled([redeemInvite("u-b", tokenA), redeemInvite("u-b", tokenA)]);
  assert.equal(paid.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await balance("u-b")).spendable, beforeB + INVITE_NEW);
  assert.equal((await balance("u-a")).spendable, beforeA + INVITE_REFERRER);
  assert.equal((await inviteState("u-a")).joined, 1);
  await assert.rejects(redeemInvite("u-b", tokenA), /already/);
  await assert.rejects(redeemInvite("u-b", "garbage"), /valid/);
  // Bob can't buy what he can't afford, crates included.
  await assert.rejects(openCase("u-b", "coffer").then(() => openCase("u-b", "cursed")), /Not enough/);
  await assert.rejects(openCrate("u-b", "missing:legendary", collectorsCrate("legendary", all, new Set()).price), /Not enough/);
  await cleanup();
  console.log("market OK");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await db.$disconnect(); process.exit(1); });
