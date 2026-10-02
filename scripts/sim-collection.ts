// Usage: npm run sim:collection — Monte Carlo of finishing the whole Black Market collection over the real catalogue.
// The player always takes the option with the lowest expected cost per NEW item (every case, and from the new rules on the
// Collector's Crates), and gets rid of duplicates at once: the old rules scrap them for half their value, the new ones sell a
// first spare for 75%. Reports the net spend (prices paid minus what the duplicates brought back) and how many days of a
// typical player's income that is. Read-only: it needs the game data (DATABASE_URL) and writes nothing.
import "dotenv/config";
import { db } from "../src/lib/db";
import { loadGameData } from "../src/lib/engine/context";
import { CASES, buildCollectibles, caseOdds, collectorsCrate, RARITY_ORDER, sellPrice, type Collectible } from "../src/lib/market/catalog";
import { DAILY_INCOME } from "../src/lib/game/economy";
import { makeRng } from "../src/lib/rng";

const RUNS = Number(process.env.RUNS ?? 40);

type Rules = { name: string; crates: boolean; dupRate: (c: Collectible) => number };

function run(all: Collectible[], rules: Rules, seed: string) {
  const rng = makeRng(seed);
  const odds = CASES.map((c) => ({ c, odds: caseOdds(c, all) }));
  const byKey = new Map(all.map((x) => [x.key, x]));
  const owned = new Set<string>();
  let net = 0, opened = 0, crates = 0;
  const log: Record<string, number> = {};
  while (owned.size < all.length) {
    // The cheapest expected cost per new item among the cases...
    let best: { cost: number; kind: "case" | "crate"; i: number } | null = null;
    for (let i = 0; i < odds.length; i++) {
      let pNew = 0, back = 0;
      for (const [k, p] of odds[i].odds) {
        if (owned.has(k)) back += p * rules.dupRate(byKey.get(k)!);
        else pNew += p;
      }
      if (pNew <= 1e-9) continue;
      const cost = (odds[i].c.price - back) / pNew;
      if (!best || cost < best.cost) best = { cost, kind: "case", i };
    }
    // ...and the crates (a new item every time, at the crate's price).
    const cr = rules.crates ? RARITY_ORDER.map((r) => collectorsCrate(r, all, owned)).filter((c) => c.missing > 0) : [];
    cr.forEach((c, i) => { if (!best || c.price < best.cost) best = { cost: c.price, kind: "crate", i }; });
    if (!best) break;
    if (best.kind === "crate") {
      const c = cr[best.i];
      net += c.price; crates++;
      log[c.id] = (log[c.id] ?? 0) + 1;
      owned.add(c.pool[Math.min(c.pool.length - 1, Math.floor(rng.next() * c.pool.length))].key);
    } else {
      const c = CASES[best.i];
      net += c.price; opened++;
      log[c.id] = (log[c.id] ?? 0) + 1;
      let t = rng.next(), key = "";
      for (const [k, p] of odds[best.i].odds) { key = k; if ((t -= p) < 0) break; }
      const it = byKey.get(key)!;
      if (owned.has(it.key)) net -= Math.round(it.value * rules.dupRate(it));
      else owned.add(it.key);
    }
  }
  return { net, opened, crates, log };
}

(async () => {
  const all = buildCollectibles(await loadGameData());
  console.log(`catalogue: ${all.length} collectibles; a full day of play is about ${DAILY_INCOME} souls`);
  const rules: Rules[] = [
    { name: "old rules (duplicates scrapped for 50%, no crates)", crates: false, dupRate: () => 0.5 },
    { name: "spares at 75%, no crates", crates: false, dupRate: (c) => sellPrice(c, 2) / c.value },
    { name: "spares at 75% and Collector's Crates", crates: true, dupRate: (c) => sellPrice(c, 2) / c.value },
  ];
  for (const r of rules) {
    const runs = Array.from({ length: RUNS }, (_, i) => run(all, r, `sim:${i}`));
    const mean = (f: (x: (typeof runs)[number]) => number) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
    const net = mean((x) => x.net);
    const use: Record<string, number> = {};
    for (const x of runs) for (const [k, n] of Object.entries(x.log)) use[k] = (use[k] ?? 0) + n / runs.length;
    console.log(`\n${r.name}\n  net spend ${Math.round(net).toLocaleString("en-US")} souls = ${Math.round(net / DAILY_INCOME)} days (${(net / DAILY_INCOME / 365).toFixed(2)} years) of a full day's play`);
    console.log(`  cases ${mean((x) => x.opened).toFixed(0)}, crates ${mean((x) => x.crates).toFixed(0)}; per option:`, Object.fromEntries(Object.entries(use).map(([k, n]) => [k, Math.round(n)])));
  }
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
