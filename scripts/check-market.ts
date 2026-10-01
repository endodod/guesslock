// Usage: npm run check:market — integration check of the Black Market against the configured database (creates and
// removes two throwaway profiles, "u-a" and "u-b"). Never run it against production.
import "dotenv/config";
if (/neon\.tech/.test(process.env.DATABASE_URL ?? "") && !process.argv.includes("--yes")) { console.error("Refusing to run against a Neon database without --yes."); process.exit(1); }
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { balance, claimSet, equip, inventoryState, marketState, openCase, sellItem, MarketError } from "../src/lib/market/service";
import { CASE_BY_ID, scrapValue, sellValue } from "../src/lib/market/catalog";
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
  // 8 parallel scrapheap crates on enough souls for five (the pool holds 10 connections): never overspends, whatever the refunds turn out to be.
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => openCase("u-a", "scrapheap")));
  const ok = r.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openCase>>>[];
  const refunds = ok.reduce((a, x) => a + x.value.refund, 0);
  const b = await balance("u-a");
  console.log("opened", ok.length, "refunds", refunds, "balance", b);
  assert.ok(b.spendable >= 0);
  assert.equal(b.earned, CRATE * 5 + 30);
  assert.equal(b.spendable, (CRATE * 5 + 30) - ok.length * CRATE + refunds);
  for (const x of r) if (x.status === "rejected" && !(x.reason instanceof MarketError)) console.log("unexpected rejection:", String(x.reason).slice(0, 300));
  assert.ok(r.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof MarketError));
  // Duplicates are scrapped, never stored twice, and the refund is the published share of the value.
  const keys = (await db.inventoryItem.findMany({ where: { userId: "u-a" } })).map((i) => i.itemKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const x of ok) if (x.value.duplicate) assert.equal(x.value.refund, scrapValue(x.value.item));
  // Selling pays a share of the value once; selling the same row again fails.
  const inv = await inventoryState("u-a");
  assert.equal(inv.items.length, keys.length);
  const first = inv.items[0];
  const before = (await balance("u-a")).spendable;
  const sold = await sellItem("u-a", first.id);
  assert.equal(sold.souls, sellValue(first));
  assert.equal((await balance("u-a")).spendable, before + sold.souls);
  await assert.rejects(sellItem("u-a", first.id), /own/);
  await assert.rejects(sellItem("u-b", inv.items[1].id), /own/); // someone else's item
  // Flair can be worn when owned, and not when it isn't.
  const flair = inv.items.find((i) => i.kind === "flair" && i.slot);
  if (flair) {
    await equip("u-a", flair.slot!, flair.key);
    await assert.rejects(equip("u-b", flair.slot!, flair.key));
  }
  // An incomplete set can't be claimed.
  await assert.rejects(claimSet("u-a", "map:all"), /complete/);
  const st = await marketState("u-a");
  console.log("state ok", st.spendable, st.cases.length, st.ledger.length);
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
  // Bob can't buy what he can't afford.
  await assert.rejects(openCase("u-b", "coffer").then(() => openCase("u-b", "cursed")), /Not enough/);
  await cleanup();
  console.log("market OK");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await db.$disconnect(); process.exit(1); });
