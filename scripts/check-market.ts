// Usage: npm run check:market — integration check of the Black Market against the configured database (creates and
// removes two throwaway profiles, "u-a" and "u-b"). Never run it against production.
import "dotenv/config";
if (/neon\.tech/.test(process.env.DATABASE_URL ?? "") && !process.argv.includes("--yes")) { console.error("Refusing to run against a Neon database without --yes."); process.exit(1); }
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { balance, createOffer, equip, marketState, openCase, respondOffer, MarketError } from "../src/lib/market/service";
(async () => {
  for (const [id, name, souls] of [["u-a", "Alice Test", 1000], ["u-b", "Bob Test", 300]] as const) {
    await db.profile.deleteMany({ where: { userId: id } });
    await db.profile.create({ data: { userId: id, displayName: name, nameKey: name.toLowerCase() } });
    await db.userStats.create({ data: { userId: id, totalSouls: souls } });
  }
  // 10 parallel strongboxes (250 each) on 1000 souls: exactly 4 can be paid (refunds may allow one more).
  const r = await Promise.allSettled(Array.from({ length: 10 }, () => openCase("u-a", "strongbox")));
  const ok = r.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openCase>>>[];
  const refunds = ok.reduce((a, x) => a + x.value.refund, 0);
  const b = await balance("u-a");
  console.log("opened", ok.length, "refunds", refunds, "balance", b);
  assert.ok(b.spendable >= 0);
  assert.equal(b.earned, 1000);
  assert.equal(b.spendable, 1000 - ok.length * 250 + refunds);
  assert.ok(r.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof MarketError));
  // Duplicates are refunded, never stored twice.
  const keys = (await db.inventoryItem.findMany({ where: { userId: "u-a" } })).map((i) => i.itemKey);
  assert.equal(new Set(keys).size, keys.length);
  // Equip an owned item; an unowned one is refused.
  const mine = (await db.inventoryItem.findFirst({ where: { userId: "u-a" } }))!;
  const slot = mine.itemKey.split(":")[0] as "title" | "color" | "theme";
  await equip("u-a", slot, mine.itemKey);
  await assert.rejects(equip("u-b", slot, mine.itemKey));
  // Trade: Alice gives her item to Bob for 100 souls.
  const { id } = await createOffer("u-a", { to: "bob test", giveItems: [mine.id], giveSouls: 0, wantItems: [], wantSouls: 100 });
  await assert.rejects(respondOffer("u-a", id, "accept")); // only the receiver
  await respondOffer("u-b", id, "accept");
  await assert.rejects(respondOffer("u-b", id, "accept")); // closed
  assert.equal((await db.inventoryItem.findUnique({ where: { id: mine.id } }))!.userId, "u-b");
  assert.equal((await balance("u-b")).spendable, 200);
  assert.equal((await balance("u-a")).spendable, b.spendable + 100);
  // Alice's equipped item left with the trade.
  const pa = await db.profile.findUnique({ where: { userId: "u-a" } });
  assert.equal(pa?.[`equipped${slot[0].toUpperCase()}${slot.slice(1)}` as "equippedTitle"], null);
  // A stale offer (items moved meanwhile) fails as a whole and moves nothing.
  const { id: id2 } = await createOffer("u-b", { to: "Alice Test", giveItems: [mine.id], giveSouls: 0, wantItems: [], wantSouls: 0 });
  await db.inventoryItem.update({ where: { id: mine.id }, data: { userId: "u-a" } });
  await assert.rejects(respondOffer("u-a", id2, "accept"));
  assert.equal((await db.tradeOffer.findUnique({ where: { id: id2 } }))!.status, "failed");
  const st = await marketState("u-b");
  console.log("state ok", st.spendable, st.items.length, st.outgoing.length, st.ledger.length);
  // Bob can't spend souls he doesn't have.
  await assert.rejects(openCase("u-b", "reliquary"), /Not enough/);
  for (const id of ["u-a", "u-b"]) { await db.profile.deleteMany({ where: { userId: id } }); await db.userStats.deleteMany({ where: { userId: id } }); await db.soulLedger.deleteMany({ where: { userId: id } }); }
  await db.tradeOffer.deleteMany({ where: { OR: [{ fromUser: { in: ["u-a", "u-b"] } }] } });
  console.log("market OK");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
