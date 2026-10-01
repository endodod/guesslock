"use client";
// The inventory: everything you own (filter by kind and rarity), sell items, claim set bonuses and wear flair.
import { useMemo, useState } from "react";
import Link from "next/link";
import { COSMETIC_BY_KEY, KIND_LABEL, KIND_ORDER, RARITY_LABEL, RARITY_ORDER, SET_CATEGORIES, sellValue, type Kind, type Rarity, type Slot } from "@/lib/market/catalog";
import type { inventoryState } from "@/lib/market/service";
import { DecoFrame } from "./ui";
import { PlayerName } from "./Hall";
import { CollectibleTile, rarityText } from "./CollectibleTile";
import { useGame } from "./GameProvider";

type State = Awaited<ReturnType<typeof inventoryState>>;
type Paid = { name: string; souls: number };

async function call(body: unknown): Promise<{ inventory?: State; result?: Paid; error?: string }> {
  const res = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "The market is closed. Try again." }));
}

export function Inventory({ initial }: { initial: State }) {
  const { toast } = useGame();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [rarity, setRarity] = useState<Rarity | "all">("all");

  const run = async (body: unknown, done?: (r: Paid | undefined) => void) => {
    if (busy) return;
    setBusy(true);
    const r = await call(body);
    setBusy(false);
    if (r.error) { toast(r.error); return; }
    if (r.inventory) setS(r.inventory);
    done?.(r.result ?? undefined);
  };

  const shown = useMemo(() => s.items.filter((i) => (kind === "all" || i.kind === kind) && (rarity === "all" || i.rarity === rarity)), [s.items, kind, rarity]);
  // Sets by category: what can be claimed first, then the nearest to done, claimed ones last.
  const groups = useMemo(() => SET_CATEGORIES.map((cat) => {
    const sets = s.sets.filter((x) => x.category === cat).sort((a, b) => {
      const rank = (x: (typeof s.sets)[number]) => (x.claimed ? 2 : x.have >= x.total ? 0 : 1);
      return rank(a) - rank(b) || b.have / b.total - a.have / a.total || a.name.localeCompare(b.name);
    });
    return { cat, sets, ready: sets.filter((x) => !x.claimed && x.have >= x.total).length, claimed: sets.filter((x) => x.claimed).length };
  }).filter((g) => g.sets.length), [s]);
  const waiting = groups.reduce((a, g) => a + g.sets.filter((x) => !x.claimed && x.have >= x.total).reduce((b, x) => b + x.reward, 0), 0);
  const chip = (on: boolean) => `min-h-9 rounded-sm border px-3 text-sm ${on ? "border-brass bg-brass/15 text-paper" : "border-brass/30 text-ash hover:text-paper"}`;

  return (
    <div className="mt-6 space-y-8">
      <DecoFrame className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="smallcaps text-sm text-brass">Your collection</p>
          <p className="font-mono text-3xl text-paper">{s.items.length} <span className="text-base text-ash">of {s.totals.items} collectibles</span></p>
          <p className="text-xs text-ash">Worth {s.worth.toLocaleString("en-US")} souls · {s.spendable.toLocaleString("en-US")} souls to spend</p>
        </div>
        <Link href="/market" className="min-h-11 rounded-[3px] border border-cursed/70 bg-cursed/15 px-5 py-2.5 text-paper hover:bg-cursed/25">Open cases in The Black Market</Link>
      </DecoFrame>

      {groups.length > 0 && (
        <section aria-labelledby="sets-h">
          <h2 id="sets-h" className="smallcaps mb-1 text-brass">Sets</h2>
          <p className="mb-3 text-sm text-ash">
            Own every item of a set to claim its bonus, once.{waiting > 0 && <span className="text-ecto"> {waiting.toLocaleString("en-US")} souls are waiting to be claimed.</span>}
          </p>
          <div className="space-y-2">
            {groups.map((g) => (
              <details key={g.cat} open={g.ready > 0} className="rounded-sm border border-brass/25 bg-iron/40">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-paper">
                  <span>{g.cat}</span>
                  <span className="font-mono text-xs text-ash">
                    {g.ready > 0 && <span className="mr-2 text-ecto">{g.ready} ready</span>}{g.claimed}/{g.sets.length} claimed
                  </span>
                </summary>
                <ul className="grid gap-2 p-2 sm:grid-cols-2">
                  {g.sets.map((x) => (
                    <li key={x.id} className="rounded-sm border border-brass/20 bg-iron/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-paper">{x.name}</span>
                          <span className="font-mono text-xs text-ash">{x.have}/{x.total} · +{x.reward.toLocaleString("en-US")} souls</span>
                        </span>
                        {x.claimed ? (
                          <span className="text-xs text-ecto">Claimed</span>
                        ) : (
                          <button
                            type="button" disabled={busy || x.have < x.total}
                            onClick={() => run({ action: "claim", setId: x.id }, (r) => r && toast(`${r.name}: +${r.souls} souls`))}
                            className="min-h-9 rounded-sm border border-ecto/60 px-3 text-sm text-ecto disabled:border-brass/20 disabled:text-ash disabled:opacity-60"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink" aria-hidden>
                        <div className={`h-full ${x.claimed || x.have >= x.total ? "bg-ecto" : "bg-brass/70"}`} style={{ width: `${Math.round((x.have / x.total) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="smallcaps mb-3 text-brass">Items</h2>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter by kind">
          <button type="button" className={chip(kind === "all")} aria-pressed={kind === "all"} onClick={() => setKind("all")}>All</button>
          {KIND_ORDER.map((k) => <button key={k} type="button" className={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by rarity">
          <button type="button" className={chip(rarity === "all")} aria-pressed={rarity === "all"} onClick={() => setRarity("all")}>Any rarity</button>
          {RARITY_ORDER.map((r) => <button key={r} type="button" className={`${chip(rarity === r)} ${rarityText(r)}`} aria-pressed={rarity === r} onClick={() => setRarity(r)}>{RARITY_LABEL[r]}</button>)}
        </div>
        {s.items.length === 0 ? (
          <p className="text-ash">Nothing yet. <Link href="/market" className="text-brass underline-offset-4 hover:underline">Open a case</Link> to start your collection.</p>
        ) : shown.length === 0 ? (
          <p className="text-ash">Nothing matches those filters.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {shown.map((i) => {
              const slot = i.slot as Slot | undefined;
              const on = slot ? s.equipped[slot] === i.key : false;
              const cosmetic = COSMETIC_BY_KEY[i.key];
              return (
                <li key={i.id}>
                  <CollectibleTile c={i}>
                    {slot && cosmetic && (
                      <p className="text-xs text-paper/90">
                        {slot === "color" ? <PlayerName name={s.name} color={cosmetic.value} />
                          : slot === "title" ? cosmetic.value
                          : <span data-vault-theme={cosmetic.value} className="inline-flex gap-1"><span className="h-3 w-3 rounded-full bg-brass" /><span className="h-3 w-3 rounded-full bg-velvet" /></span>}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2">
                      {slot && (
                        <button
                          type="button" disabled={busy}
                          onClick={() => run({ action: "equip", slot, key: on ? null : i.key }, () => { if (slot === "theme") location.reload(); })}
                          className={`min-h-9 rounded-sm px-3 text-xs ${on ? "border border-ecto/60 text-ecto" : "border border-brass/30 text-ash hover:text-paper"}`}
                        >
                          {on ? "Worn" : "Wear"}
                        </button>
                      )}
                      <button
                        type="button" disabled={busy}
                        onClick={() => { if (window.confirm(`Sell ${i.name} for ${sellValue(i)} souls?`)) void run({ action: "sell", itemId: i.id }, (r) => r && toast(`Sold ${r.name} for ${r.souls} souls.`)); }}
                        className="min-h-9 rounded-sm px-3 text-xs text-ash hover:text-paper"
                      >
                        Sell for {sellValue(i)}
                      </button>
                    </div>
                  </CollectibleTile>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
