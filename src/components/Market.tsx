"use client";
// The Black Market: balance, cases (with their odds), the collection with equip buttons, and trades.
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CASES, COSMETIC_BY_KEY, DUPLICATE_REFUND, RARITY_LABEL, RARITY_ORDER, casePool, type Cosmetic, type Rarity, type Slot,
} from "@/lib/market/catalog";
import type { marketState } from "@/lib/market/service";
import { DecoFrame } from "./ui";
import { PlayerName } from "./Hall";
import { useGame } from "./GameProvider";

type State = Awaited<ReturnType<typeof marketState>>;
const RARITY_CLS: Record<Rarity, string> = {
  common: "border-ash/40 text-paper", rare: "border-[#7d9ef0]/70 text-[#a9c0ff]", epic: "border-cursed/70 text-[#c7b2ff]", legendary: "border-brass text-brass shadow-[0_0_18px_rgba(201,164,92,0.45)]",
};
const SLOT_LABEL: Record<Slot, string> = { title: "Titles", color: "Name colours", theme: "Vault themes" };

async function call(body: unknown): Promise<{ state?: State; result?: unknown; error?: string }> {
  const res = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "The market is closed. Try again." }));
}

function CosmeticChip({ c, name }: { c: Cosmetic; name: string }) {
  return (
    <span className={`inline-flex min-h-9 items-center rounded-sm border px-2 text-sm ${RARITY_CLS[c.rarity]}`}>
      {c.slot === "title" ? c.value : c.slot === "color" ? <PlayerName name={name} color={c.value} /> : <span data-vault-theme={c.value} className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-brass" /><span className="h-3 w-3 rounded-full bg-velvet" />{c.name}</span>}
    </span>
  );
}

export function Market({ initial }: { initial: State }) {
  const { toast } = useGame();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ item: Cosmetic; duplicate: boolean; refund: number } | null>(null);
  const owned = new Set(s.items.map((i) => i.key));

  const run = async (body: unknown, after?: (r: unknown) => void) => {
    if (busy) return;
    setBusy(true);
    const r = await call(body);
    setBusy(false);
    if (r.error) { toast(r.error); return; }
    if (r.state) setS(r.state);
    after?.(r.result);
  };

  return (
    <div className="mt-6 space-y-8">
      <DecoFrame className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="smallcaps text-sm text-brass">Your purse</p>
          <p className="font-mono text-3xl text-paper">{s.spendable.toLocaleString("en-US")} <span className="text-base text-ash">souls to spend</span></p>
          <p className="text-xs text-ash">{s.earned.toLocaleString("en-US")} earned in ranked play (what the leaderboards count)</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-ash">On the boards you appear as</p>
          <p className="text-lg"><PlayerName name={s.name} color={s.equipped.color ? COSMETIC_BY_KEY[s.equipped.color]?.value : null} /></p>
          {s.equipped.title && <p className="text-xs text-brass">{COSMETIC_BY_KEY[s.equipped.title]?.value}</p>}
        </div>
      </DecoFrame>

      <section aria-labelledby="cases-h">
        <h2 id="cases-h" className="smallcaps mb-3 text-brass">Cases</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {CASES.map((c) => {
            const pool = casePool(c);
            return (
              <DecoFrame key={c.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl text-paper">{c.name}</h3>
                    <p className="text-sm text-ash">{c.description}</p>
                  </div>
                  <span className="font-mono text-lg text-brass">{c.price}</span>
                </div>
                <table className="text-sm">
                  <caption className="sr-only">Drop odds</caption>
                  <tbody>
                    {RARITY_ORDER.map((r) => (
                      <tr key={r}>
                        <td className={`py-0.5 ${RARITY_CLS[r].split(" ")[1]}`}>{RARITY_LABEL[r]}</td>
                        <td className="text-right font-mono text-paper/90">{Math.round(c.odds[r] * 100)}%</td>
                        <td className="pl-3 text-right text-xs text-ash">{pool[r].filter((x) => owned.has(x.key)).length}/{pool[r].length} owned</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-ash">A duplicate returns {Math.round(c.price * DUPLICATE_REFUND)} souls.</p>
                <button
                  type="button"
                  disabled={busy || s.spendable < c.price}
                  onClick={() => run({ action: "open", caseId: c.id }, (r) => setReveal(r as typeof reveal))}
                  className="mt-auto min-h-12 rounded-[3px] border border-cursed/70 bg-cursed/15 px-5 text-paper hover:bg-cursed/25 disabled:opacity-40"
                >
                  {s.spendable < c.price ? `Needs ${c.price} souls` : `Open for ${c.price} souls`}
                </button>
              </DecoFrame>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {reveal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReveal(null)}>
            <motion.div role="status" className="deco rounded-md px-8 py-6 text-center" initial={{ rotateY: 90, scale: 0.8 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
              <p className={`smallcaps text-sm ${RARITY_CLS[reveal.item.rarity].split(" ")[1]}`}>{RARITY_LABEL[reveal.item.rarity]} · {SLOT_LABEL[reveal.item.slot].replace(/s$/, "")}</p>
              <p className="mt-2 font-display text-3xl text-paper">{reveal.item.name}</p>
              <div className="mt-3"><CosmeticChip c={reveal.item} name={s.name} /></div>
              <p className="mt-3 text-sm text-ash">{reveal.duplicate ? `Already yours: ${reveal.refund} souls back.` : "Added to your collection."}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section aria-labelledby="coll-h">
        <h2 id="coll-h" className="smallcaps mb-3 text-brass">Your collection · {owned.size} of {Object.keys(COSMETIC_BY_KEY).length}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(["title", "color", "theme"] as Slot[]).map((slot) => {
            const mine = s.items.filter((i) => COSMETIC_BY_KEY[i.key]?.slot === slot);
            const equipped = s.equipped[slot];
            return (
              <DecoFrame key={slot} className="p-4" corners={false}>
                <h3 className="mb-2 text-paper">{SLOT_LABEL[slot]}</h3>
                {mine.length === 0 ? <p className="text-sm text-ash">Nothing yet.</p> : (
                  <ul className="space-y-2">
                    {mine.map((i) => {
                      const c = COSMETIC_BY_KEY[i.key];
                      const on = equipped === i.key;
                      return (
                        <li key={i.id} className="flex items-center justify-between gap-2">
                          <CosmeticChip c={c} name={s.name} />
                          <button type="button" disabled={busy} onClick={() => run({ action: "equip", slot, key: on ? null : i.key }, () => slot === "theme" && location.reload())}
                            className={`min-h-9 rounded-sm px-2 text-xs ${on ? "border border-ecto/60 text-ecto" : "text-ash hover:text-paper"}`}>
                            {on ? "Equipped" : "Equip"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </DecoFrame>
            );
          })}
        </div>
      </section>

      <Trades s={s} busy={busy} run={run} />

      {s.ledger.length > 0 && (
        <details className="text-sm text-ash">
          <summary className="cursor-pointer text-paper">History</summary>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {s.ledger.map((l, i) => <li key={i}>{l.at.slice(0, 16).replace("T", " ")} · {l.delta > 0 ? "+" : ""}{l.delta} · {l.reason}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Trades({ s, busy, run }: { s: State; busy: boolean; run: (body: unknown) => Promise<void> }) {
  const [to, setTo] = useState("");
  const [theirs, setTheirs] = useState<{ id: number; key: string }[] | null>(null);
  const [give, setGive] = useState<number[]>([]);
  const [want, setWant] = useState<number[]>([]);
  const [souls, setSouls] = useState(0);
  const [dir, setDir] = useState<"give" | "want">("want");
  const { toast } = useGame();
  const toggle = (list: number[], set: (v: number[]) => void, id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const look = async () => {
    const r = await fetch(`/api/market?of=${encodeURIComponent(to)}`).then((x) => x.json()).catch(() => ({ error: "Try again." }));
    if (r.error) { toast(r.error); setTheirs(null); return; }
    setTheirs(r.items); setWant([]);
  };
  const offerLine = (o: State["incoming"][number], mine: boolean) => {
    const items = (l: { id: number; key: string | null }[]) => l.map((x) => COSMETIC_BY_KEY[x.key ?? ""]?.name ?? "a missing item").join(", ");
    const parts = [
      o.give.length || o.giveSouls ? `${mine ? "you give" : `${o.from} gives`} ${[items(o.give), o.giveSouls ? `${o.giveSouls} souls` : ""].filter(Boolean).join(" + ")}` : "",
      o.want.length || o.wantSouls ? `${mine ? "for" : "for your"} ${[items(o.want), o.wantSouls ? `${o.wantSouls} souls` : ""].filter(Boolean).join(" + ")}` : "",
    ];
    return parts.filter(Boolean).join(" ");
  };
  return (
    <section aria-labelledby="trade-h" className="space-y-4">
      <h2 id="trade-h" className="smallcaps text-brass">Trades</h2>
      {s.incoming.length > 0 && (
        <DecoFrame className="p-4" corners={false}>
          <h3 className="mb-2 text-paper">Offers for you</h3>
          <ul className="space-y-2 text-sm">
            {s.incoming.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-paper/90">{offerLine(o, false)}{o.message && <span className="block text-xs text-ash">“{o.message}”</span>}</span>
                <button type="button" disabled={busy} onClick={() => run({ action: "respond", id: o.id, answer: "accept" })} className="min-h-9 rounded-sm border border-ecto/60 px-3 text-ecto">Accept</button>
                <button type="button" disabled={busy} onClick={() => run({ action: "respond", id: o.id, answer: "decline" })} className="min-h-9 px-2 text-ash hover:text-paper">Decline</button>
              </li>
            ))}
          </ul>
        </DecoFrame>
      )}
      <DecoFrame className="space-y-3 p-4" corners={false}>
        <h3 className="text-paper">Make an offer</h3>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="trade-to">Player name</label>
          <input id="trade-to" value={to} onChange={(e) => setTo(e.target.value)} maxLength={40} placeholder="Player name" className="min-h-11 min-w-0 flex-1 rounded-[3px] border border-brass/40 bg-ink px-3 text-paper" />
          <button type="button" onClick={look} disabled={!to.trim()} className="min-h-11 rounded-[3px] border border-brass/50 px-4 text-paper disabled:opacity-40">See their collection</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-ash">You give</p>
            <div className="flex flex-wrap gap-1.5">
              {s.items.length === 0 && <span className="text-sm text-ash">No items.</span>}
              {s.items.map((i) => (
                <button key={i.id} type="button" aria-pressed={give.includes(i.id)} onClick={() => toggle(give, setGive, i.id)} className={`rounded-sm border px-2 py-1 text-xs ${give.includes(i.id) ? "border-ecto text-ecto" : "border-brass/30 text-paper/80"}`}>{COSMETIC_BY_KEY[i.key]?.name}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-ash">You ask for</p>
            <div className="flex flex-wrap gap-1.5">
              {!theirs && <span className="text-sm text-ash">Look up a player first.</span>}
              {theirs?.length === 0 && <span className="text-sm text-ash">They have no items.</span>}
              {theirs?.map((i) => (
                <button key={i.id} type="button" aria-pressed={want.includes(i.id)} onClick={() => toggle(want, setWant, i.id)} className={`rounded-sm border px-2 py-1 text-xs ${want.includes(i.id) ? "border-ecto text-ecto" : "border-brass/30 text-paper/80"}`}>{COSMETIC_BY_KEY[i.key]?.name}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ash">Souls:</span>
          <select value={dir} onChange={(e) => setDir(e.target.value as "give" | "want")} className="min-h-11 rounded-[3px] border border-brass/40 bg-ink px-2 text-paper">
            <option value="want">you ask for</option>
            <option value="give">you add</option>
          </select>
          <input type="number" min={0} max={10000} value={souls} onChange={(e) => setSouls(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))} className="min-h-11 w-28 rounded-[3px] border border-brass/40 bg-ink px-2 text-paper" />
          <button
            type="button"
            disabled={busy || !to.trim() || (!give.length && !want.length && !souls)}
            onClick={async () => {
              await run({ action: "offer", to, giveItems: give, wantItems: want, giveSouls: dir === "give" ? souls : 0, wantSouls: dir === "want" ? souls : 0 });
              setGive([]); setWant([]); setSouls(0);
            }}
            className="ml-auto min-h-11 rounded-[3px] border border-ecto/70 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20 disabled:opacity-40"
          >
            Send offer
          </button>
        </div>
        <p className="text-xs text-ash">Nothing moves until they accept; then everything changes hands at once, or nothing does.</p>
      </DecoFrame>
      {s.outgoing.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-paper">Your offers</summary>
          <ul className="mt-2 space-y-1">
            {s.outgoing.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 text-paper/90">
                <span className="flex-1">To {o.to}: {offerLine(o, true)} · <span className="text-ash">{o.status}</span></span>
                {o.status === "open" && <button type="button" disabled={busy} onClick={() => run({ action: "respond", id: o.id, answer: "cancel" })} className="min-h-9 px-2 text-ash hover:text-paper">Cancel</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
