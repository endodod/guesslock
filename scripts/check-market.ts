// Usage: npm run check:market — integration check of the Black Market against the configured database (creates and
// removes two throwaway profiles, "u-a" and "u-b"). Never run it against production.
import "dotenv/config";
if (/neon\.tech/.test(process.env.DATABASE_URL ?? "") && !process.argv.includes("--yes")) { console.error("Refusing to run against a Neon database without --yes."); process.exit(1); }
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { balance, claimSet, equip, inventoryState, marketState, openCase, sellItem, MarketError } from "../src/lib/market/service";
import { scrapValue, sellValue } from "../src/lib/market/catalog";

const USERS = ["u-a", "u-b"];
const cleanup = async () => {
  for (const id of USERS) {
    await db.profile.deleteMany({ where: { userId: id } });
    await db.userStats.deleteMany({ where: { userId: id } });
    await db.soulLedger.deleteMany({ where: { userId: id } });
  }
};

(async () => {
  await cleanup();
  for (const [id, name, souls] of [["u-a", "Alice Test", 1000], ["u-b", "Bob Test", 50]] as const) {
    await db.profile.create({ data: { userId: id, displayName: name, nameKey: name.toLowerCase() } });
    await db.userStats.create({ data: { userId: id, totalSouls: souls } });
  }
  // 12 parallel scrapheap crates (140 each) on 1000 souls: never overspends, whatever the refunds turn out to be.
  const r = await Promise.allSettled(Array.from({ length: 12 }, () => openCase("u-a", "scrapheap")));
  const ok = r.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openCase>>>[];
  const refunds = ok.reduce((a, x) => a + x.value.refund, 0);
  const b = await balance("u-a");
  console.log("opened", ok.length, "refunds", refunds, "balance", b);
  assert.ok(b.spendable >= 0);
  assert.equal(b.earned, 1000);
  assert.equal(b.spendable, 1000 - ok.length * 140 + refunds);
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
  // Bob can't buy what he can't afford.
  await assert.rejects(openCase("u-b", "relic"), /Not enough/);
  await cleanup();
  console.log("market OK");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await db.$disconnect(); process.exit(1); });
