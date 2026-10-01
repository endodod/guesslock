"use client";
// The Black Market: your purse, the cases (with their odds and what is inside them) and the opening animation. Your
// collection, selling, set bonuses and flair live on the inventory page.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { COSMETIC_BY_KEY, KIND_LABEL, RARITY_LABEL, RARITY_ORDER, type Collectible, type Kind } from "@/lib/market/catalog";
import type { marketState } from "@/lib/market/service";
import { DecoFrame } from "./ui";
import { PlayerName } from "./Hall";
import { Art, RARITY_CLS, rarityText } from "./CollectibleTile";
import { useGame } from "./GameProvider";
import { EarnSouls, type EarnState } from "./EarnSouls";

type State = Awaited<ReturnType<typeof marketState>>;
type CaseView = State["cases"][number];
type Reveal = { item: Collectible; duplicate: boolean; refund: number };

async function call(body: unknown): Promise<{ state?: State; result?: unknown; error?: string }> {
  const res = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "The market is closed. Try again." }));
}

// ───────────── the reel ─────────────

const TILE = 112;
const GAP = 8;
const STEP = TILE + GAP;
const WIN = 40;
const TOTAL = 48;

/** The strip that spins past: what the case holds, drawn at its odds (so it looks like what could drop), the winner in place. */
function buildReel(c: CaseView, winner: Collectible): Collectible[] {
  const by = RARITY_ORDER.map((r) => c.preview.filter((x) => x.rarity === r));
  const pickRarity = () => {
    let t = Math.random();
    for (let i = 0; i < RARITY_ORDER.length; i++) {
      t -= c.odds[RARITY_ORDER[i]];
      if (t < 0 && by[i].length) return by[i];
    }
    return c.preview;
  };
  return Array.from({ length: TOTAL }, (_, i) => {
    if (i === WIN) return winner;
    const pool = pickRarity();
    return pool[Math.floor(Math.random() * pool.length)] ?? winner;
  });
}

function CaseOpening({ c, result, onSettled, onClose, onAgain, canAgain }: {
  c: CaseView; result: Reveal; onSettled: () => void; onClose: () => void; onAgain: () => void; canAgain: boolean;
}) {
  const { reducedMotion, play } = useGame();
  const [tiles] = useState(() => buildReel(c, result.item));
  const [jitter] = useState(() => (Math.random() - 0.5) * TILE * 0.6);
  const box = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  // With reduced motion there is no reel: the result is shown at once.
  const [revealed, setRevealed] = useState(reducedMotion);
  const [skipped, setSkipped] = useState(false);

  const settle = () => {
    setRevealed((was) => {
      if (!was) {
        onSettled();
        play(result.item.rarity === "legendary" ? "creak" : "click");
      }
      return true;
    });
  };

  useEffect(() => {
    if (reducedMotion) { onSettled(); play(result.item.rarity === "legendary" ? "creak" : "click"); return; }
    const w = box.current?.clientWidth ?? 640;
    setTarget(-(WIN * STEP + TILE / 2 - w / 2 + jitter));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink/90 p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => revealed && onClose()}
    >
      <p className="smallcaps text-sm text-brass">{c.name}</p>
      {!reducedMotion && (
        <div ref={box} className="relative h-36 w-full max-w-3xl overflow-hidden rounded-sm border border-brass/40 bg-iron/80" aria-hidden>
          <motion.div
            className="absolute left-0 top-0 flex h-full items-center"
            style={{ gap: GAP, paddingLeft: 0 }}
            initial={{ x: 0 }}
            animate={{ x: target ?? 0 }}
            transition={target === null ? { duration: 0 } : skipped ? { duration: 0.01 } : { duration: 5.6, ease: [0.08, 0.62, 0.12, 1] }}
            onAnimationComplete={() => target !== null && settle()}
          >
            {tiles.map((t, i) => (
              <div key={i} style={{ width: TILE }} className={`flex h-28 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border bg-ink/70 p-1 ${RARITY_CLS[t.rarity].split(" ").filter((x) => x.startsWith("border")).join(" ")}`}>
                <Art c={t} size="h-14 w-14" />
                <span className="w-full truncate text-center text-[0.65rem] text-paper/90">{t.name}</span>
                <span className={`text-[0.6rem] ${rarityText(t.rarity)}`}>{RARITY_LABEL[t.rarity]}</span>
              </div>
            ))}
          </motion.div>
          {/* the marker the reel stops under */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-brass shadow-[0_0_12px_rgba(201,164,92,0.9)]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-brass" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-ink to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-ink to-transparent" />
        </div>
      )}
      {!revealed && !reducedMotion && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setSkipped(true); setTarget(-(WIN * STEP + TILE / 2 - (box.current?.clientWidth ?? 640) / 2 + jitter)); }} className="min-h-10 px-4 text-sm text-ash hover:text-paper">
          Skip
        </button>
      )}
      <AnimatePresence>
        {revealed && (
          <motion.div
            role="status"
            className={`deco w-full max-w-xs rounded-md border-2 px-8 py-6 text-center ${RARITY_CLS[result.item.rarity].split(" ").filter((x) => x.startsWith("border") || x.startsWith("shadow")).join(" ")}`}
            initial={{ rotateY: 90, scale: 0.8, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={`smallcaps text-sm ${rarityText(result.item.rarity)}`}>{RARITY_LABEL[result.item.rarity]} · {KIND_LABEL[result.item.kind].replace(/s$/, "")}</p>
            <div className="my-3 flex justify-center"><Art c={result.item} size="h-24 w-24" /></div>
            <p className="font-display text-2xl text-paper">{result.item.name}</p>
            {result.item.sub && <p className="text-xs text-ash">{result.item.sub}</p>}
            <p className="mt-3 text-sm text-ash">
              {result.duplicate ? `Already yours: scrapped for ${result.refund} souls.` : `Added to your inventory · worth ${result.item.value} souls.`}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={onClose} className="min-h-10 rounded-sm border border-brass/40 px-4 text-sm text-paper hover:border-brass">Close</button>
              <button type="button" disabled={!canAgain} onClick={onAgain} className="min-h-10 rounded-sm border border-cursed/70 bg-cursed/15 px-4 text-sm text-paper hover:bg-cursed/25 disabled:opacity-40">
                {canAgain ? `Open another (${c.price})` : "Can't afford another"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ───────────── the shop window ─────────────

export function Market({ initial, earn }: { initial: State; earn: EarnState }) {
  const { toast } = useGame();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<{ c: CaseView; result: Reveal; next: State } | null>(null);

  const open = async (c: CaseView) => {
    if (busy || opening) return;
    setBusy(true);
    const r = await call({ action: "open", caseId: c.id });
    setBusy(false);
    if (r.error || !r.state) { toast(r.error ?? "The market is closed. Try again."); return; }
    // The purse and counts update when the reel stops, so the numbers don't give the result away.
    setOpening({ c, result: r.result as Reveal, next: r.state });
  };

  const settle = () => {
    if (!opening) return;
    const next = opening.next;
    setS((prev) => ({ ...next, cases: next.cases.map((c) => ({ ...c, preview: prev.cases.find((x) => x.id === c.id)?.preview ?? [] })) }));
  };

  const again = () => {
    const c = opening && s.cases.find((x) => x.id === opening.c.id);
    setOpening(null);
    if (c) void open(c);
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
          <Link href="/inventory" className="mt-2 inline-block min-h-9 text-brass underline-offset-4 hover:underline">Open your inventory →</Link>
        </div>
      </DecoFrame>

      <section aria-labelledby="cases-h">
        <h2 id="cases-h" className="smallcaps mb-3 text-brass">Cases</h2>
        <p className="mb-3 text-sm text-ash">
          Every case holds collectibles of four rarities. Each has a value in souls: a duplicate is scrapped for half of it, and any item can be sold from your inventory. Complete sets for bonuses.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {s.cases.map((c) => (
            <DecoFrame key={c.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl text-paper">{c.name}</h3>
                  <p className="text-sm text-ash">{c.description}</p>
                  <p className="mt-1 text-xs text-ash">Holds: {(Object.keys(c.kinds) as Kind[]).map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}</p>
                </div>
                <span className="font-mono text-lg text-brass">{c.price.toLocaleString("en-US")}</span>
              </div>
              <table className="text-sm">
                <caption className="sr-only">Drop odds</caption>
                <tbody>
                  {RARITY_ORDER.map((r) => (
                    <tr key={r}>
                      <td className={`py-0.5 ${rarityText(r)}`}>{RARITY_LABEL[r]}</td>
                      <td className="text-right font-mono text-paper/90">{c.odds[r] * 100 >= 1 ? Math.round(c.odds[r] * 100) : "<1"}%</td>
                      <td className="pl-3 text-right text-xs text-ash">{c.pool[r].owned}/{c.pool[r].total} owned</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-ash">On average a case is worth about {c.ev.toLocaleString("en-US")} souls in items.</p>
              <button
                type="button"
                disabled={busy || !!opening || s.spendable < c.price}
                onClick={() => open(c)}
                className="mt-auto min-h-12 rounded-[3px] border border-cursed/70 bg-cursed/15 px-5 text-paper hover:bg-cursed/25 disabled:opacity-40"
              >
                {s.spendable < c.price ? `Needs ${c.price.toLocaleString("en-US")} souls` : `Open for ${c.price.toLocaleString("en-US")} souls`}
              </button>
            </DecoFrame>
          ))}
        </div>
      </section>

      <EarnSouls
        initial={earn}
        onPaid={(next) => setS((prev) => ({ ...next, cases: next.cases.map((c) => ({ ...c, preview: prev.cases.find((x) => x.id === c.id)?.preview ?? [] })) }))}
      />

      <AnimatePresence>
        {opening && (
          <CaseOpening
            key={opening.next.ledger[0]?.at + opening.c.id}
            c={opening.c} result={opening.result} onSettled={settle} onClose={() => setOpening(null)} onAgain={again}
            canAgain={opening.next.spendable >= opening.c.price}
          />
        )}
      </AnimatePresence>

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
