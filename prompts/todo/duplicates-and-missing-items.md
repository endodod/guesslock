# Duplicates worth more, and a way to get the items you don't own

Two changes to The Black Market so a collector can actually finish the collection and doubles are no longer a loss:

1. **Multiples in the inventory sell for more.** Spare copies of an item are kept (as a stack) instead of being scrapped at
   once, and a spare copy sells for more than the last copy.
2. **A special crate that only holds items you don't own yet**, with a price that scales with the rarity of what is in it.

> Read `AGENTS.md` first (this Next.js has breaking changes; check `node_modules/next/dist/docs/` when unsure), then the
> Black Market code: `src/lib/market/catalog.ts`, `service.ts`, `earn.ts`, `src/lib/game/economy.ts`, the pages
> `src/app/(game)/market/page.tsx` and `src/app/(game)/inventory/page.tsx`, and `src/components/Market.tsx`,
> `Inventory.tsx`. The earlier idea of a player-to-player market was dropped on purpose; do not build it.

## Why

A simulation of the cheapest strategy (always buy the case with the lowest expected cost per new item) says owning all 448
collectibles costs about **3.8 million souls**, roughly 2,000 days of finishing every lock (a full day is about 1,920
souls). The last items are the problem: each of the 44 legendary shop items has under a 1% chance per Shopkeeper's Crate.
Duplicates are also a pure loss today: a duplicate is scrapped immediately for 50% of its value
(`openCase` in `service.ts`, `scrapValue` in `catalog.ts`).

Target (change on request): a dedicated player who plays every day finishes the collection in **about one year**, i.e.
roughly 0.7 million souls of net spend including the daily income that goes into it. Tune with a Monte Carlo simulation
over the real catalogue (rebuild the one used for the 3.8 million figure: per case the exact probability of every item
as `rollCase` produces it, greedy choice of the cheapest case per new item, 40 seeded runs).

## 1. Multiples (stacks)

Current state: the inventory holds at most one `InventoryItem` row per `itemKey` per player; a duplicate draw is scrapped
into souls in the same transaction. Sets, the Collectors board and `inventoryState` count distinct keys.

Change:

- Keep a duplicate as a **copy**: another `InventoryItem` row with the same `itemKey` (no schema change is needed; there is no
  unique constraint on `(userId, itemKey)`, only an index). The inventory page shows a stack ("× 3") with the count.
  Everything that counts ownership must count distinct keys (`collectionCounts`, set progress and `claimSet`, the
  `have`/`owned` sets, `equip`) and the worth of the collection counts every copy or only the first (decide and document).
- A **spare copy sells for more than the last copy.** Suggested: the last copy 60% of its value (today's `SELL_RATE`),
  spare copies a rising rate by stack position, e.g. 75% for the first spare, 85% for the second, 95% from the third on, so
  duplicates are a small win instead of a loss and hoarding doubles stays slightly worse than selling (it must never beat
  the price of a case's expected payout, or cases become free money: check `expectedValue` against the best spare rate).
  Put the rates in `catalog.ts` next to `SELL_RATE`, with a pure `sellPrice(item, copiesOwned)` used by server and client.
- "Sell spares" button on a stack (sells every copy beyond the first in one transaction) next to "Sell one".
- Opening a case no longer scraps duplicates automatically (the reveal says "Duplicate: kept as a spare"); remove
  `DUPLICATE_RATE` and `scrapValue` or keep `scrapValue` only as the rate for the "Sell spares" quick action.
- Existing players: nothing to migrate (they hold one copy of everything they own). Ledger reasons: keep `sell`,
  add `sell-spares` if you split them.

## 2. The missing-items crate

A crate that **never gives something you already own**, so a collector always makes progress.

- Name and place: "Collector's Crate" (or one per tier, see below), in the case grid of `/market` with a visible
  "Only items you don't own" label. Unavailable ("You own everything of this tier") when nothing is missing.
- **Price scales with the rarity of what is inside.** Suggested: one crate per rarity tier (Common / Rare / Epic /
  Legendary Collector's Crate) that draws uniformly from the items of that rarity you don't own yet, priced as a multiple
  of the **average value of the missing items of that rarity** (e.g. 2.0×, because it removes the luck and the duplicate
  refund), so the price rises as you complete a tier and falls to nothing when the tier is complete. Show the price and the
  exact list size ("12 of 44 legendary items still missing") before buying; the price is computed on the server at
  purchase time and must match what the client displayed (reject with a clear message if it changed).
- Alternative the owner may prefer: a **targeted buy** of one chosen missing item at a fixed multiple of its value
  (about 2.5×). Implement whichever is requested; the tier crate is the default.
- It must not undermine ordinary cases: its price per new item must stay above the ordinary cases' expected cost per
  new item early in a collection and below it near completion (that is the point), and never below the item's value.
- Same transaction rules as `openCase`: pay with `spend`, draw with crypto-random `uniform`, create the row, ledger reason
  `crate-missing`, all in `marketTx`.
- Include the new crate in the completion simulation and report the new average net cost to finish the collection.

## Files to touch (guide)

`src/lib/market/catalog.ts` (rates, `sellPrice`, crate definition and price function), `service.ts` (`openCase` duplicate
handling, `sellItem` by copy, `sellSpares`, the missing crate purchase, ownership by distinct key, `marketState` /
`inventoryState` with counts), `src/app/api/market/route.ts` (new actions), `Market.tsx` (crate card, reveal text),
`Inventory.tsx` and `CollectibleTile.tsx` (stack badge, sell one / sell spares), `scripts/check-market.ts`,
`src/tests/market.test.ts`, README ("The soul economy" paragraph).

## Tests and checks

- Unit: `sellPrice` rises with the stack and stays below the case payout; the missing-crate price is monotone in what is
  left of a tier and never below the value of the item; distinct-key counting in sets and collection worth.
- `npm run check:market -- --yes` (creates and deletes two throwaway profiles): a duplicate draw is kept, the stack count is
  right, selling a spare pays the spare rate, selling the last copy the base rate, the missing crate never returns an
  owned key, parallel purchases don't double-spend or double-deliver, and the price is the server's.
- Re-run the completion simulation and put the old and new numbers in the commit message.

## Decisions already made

- No player-to-player market, no trading.
- Souls from selling go to the wallet only (spendable, never counted for the leaderboards), like every other way to earn.
- Prices are in today's economy (`src/lib/game/economy.ts`); never hard-code souls, derive from item values.
- Prefer no schema change; if one becomes necessary, write an additive migration and say so.

## Gotchas

- Use the Write tool or a script file for edits with apostrophes; long shell heredocs with quotes broke earlier.
- After `prisma generate` restart `next dev`; it keeps the old client in memory.
- Item values already scale with the economy; set bonuses are derived from values, so a larger collection worth changes
  them: keep the "set pays less than its items are worth" test green.
