"use client";
// Clue stages of the newer locks: The Calculus (stats), The Decoy (pick the fake item), The Cache (match inventories)
// and The Constellation (3x3 category grid). The last three are also their own input.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { CatalogEntry, Clue } from "@/lib/engine/types";
import { DecoFrame } from "./ui";
import { GuessInput } from "./GuessInput";

/** `onGuess` resolves true when the lock opened; a refused move leaves the view unchanged. */
type Play = { onGuess?: (id: string) => Promise<boolean>; busy?: boolean; disabled?: boolean; done?: boolean };

// ───────────── The Calculus ─────────────

export function StatsStage({ clue }: { clue: Extract<Clue, { kind: "stats" }> }) {
  return (
    <div className="clue-layer grid gap-3 sm:grid-cols-2">
      {clue.abilities.map((a) => (
        <DecoFrame key={a.slot} className="p-3 md:p-4">
          <p className="smallcaps mb-2 text-xs text-brass">{a.slot}</p>
          <ul className="grid gap-1.5 font-mono text-sm">
            {a.stats.map((s, i) => (
              <li key={i} className={`flex items-center justify-between gap-3 rounded-sm bg-ink/50 px-3 py-1.5 ${s.display === null ? "ring-1 ring-ecto/40" : ""}`}>
                <span className="font-body text-paper/90">{s.label}</span>
                <span className={s.display === null ? "text-ecto" : "text-brass"}>{s.display ?? "??"}</span>
              </li>
            ))}
          </ul>
        </DecoFrame>
      ))}
    </div>
  );
}

// ───────────── The Decoy ─────────────

export function DecoyStage({ clue, picked, onGuess, busy, disabled, done }: { clue: Extract<Clue, { kind: "decoy" }>; picked: Map<string, boolean> } & Play) {
  return (
    <div className="clue-layer rounded-sm border border-brass/40 bg-[radial-gradient(ellipse_at_top,#5a2429,#2a0f12)] p-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.7)]">
      <div className="mb-3 flex items-center gap-3">
        {clue.hero ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {clue.hero.image && <img src={clue.hero.image} alt="" className="h-12 w-12 rounded-sm object-cover object-top" />}
            <p className="text-sm text-paper/90"><span className="text-brass">{clue.hero.name}</span>&apos;s build. One of these items doesn&apos;t belong.</p>
          </>
        ) : (
          <p className="text-sm text-paper/90">Someone&apos;s build. One of these items doesn&apos;t belong.</p>
        )}
      </div>
      <ul className="grid grid-cols-4 gap-2 sm:gap-3">
        {clue.items.map((it) => {
          const verdict = picked.get(it.id);
          const can = !!onGuess && !done && !disabled && !busy && verdict === undefined;
          return (
            <li key={it.id}>
              <button
                type="button"
                disabled={!can}
                onClick={() => onGuess?.(it.id)}
                aria-label={`${it.name}${verdict === false ? ": belongs to the build" : verdict ? ": the fake" : ""}`}
                className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-sm bg-ink/70 p-1.5 transition slot-edge-${it.slot} ${can ? "hover:bg-ink hover:ring-2 hover:ring-ecto/60 focus-visible:ring-2 focus-visible:ring-ecto" : ""} ${verdict === false ? "opacity-35 grayscale" : ""} ${verdict ? "ring-2 ring-ecto shadow-[0_0_18px_rgba(127,227,194,0.45)]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image ?? ""} alt="" className="h-3/5 w-3/5 object-contain" />
                <span className="mt-1 line-clamp-2 text-center text-[0.65rem] leading-tight text-paper/90 sm:text-xs">{it.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {onGuess && !done && <p className="mt-3 text-center text-xs text-ash">Tap the item that doesn&apos;t belong.</p>}
    </div>
  );
}

// ───────────── The Cache ─────────────

export function CacheStage({ clue, onGuess, busy, disabled, done }: { clue: Extract<Clue, { kind: "cache" }> } & Play) {
  const n = clue.inventories.length;
  const [choice, setChoice] = useState<(string | null)[]>(() => Array(n).fill(null));
  // Matched inventories are locked in by the verdict; the rest keep the player's choice (unless that hero got locked elsewhere).
  const pick = clue.locked.map((l, i) => l ?? (choice[i] && !clue.locked.includes(choice[i]) ? choice[i] : null));
  const hero = (id: string | null) => clue.heroes.find((h) => h.id === id);
  const complete = pick.every(Boolean) && new Set(pick).size === n;
  const assign = (i: number, id: string) =>
    setChoice(pick.map((x, k) => (k === i ? id || null : x === id && !clue.locked[k] ? null : x)));
  return (
    <div className="clue-layer space-y-3">
      <p className="text-center text-sm text-ash">The {clue.team} team at the end of the match. Who carried which inventory?</p>
      <ul className="flex flex-wrap justify-center gap-2" aria-label="Heroes on the team">
        {clue.heroes.map((x) => {
          const used = pick.includes(x.id);
          return (
            <li key={x.id} className={`flex w-16 flex-col items-center gap-1 rounded-sm border p-1 text-center ${used ? "border-ecto/50 bg-ecto/5 opacity-60" : "border-brass/30 bg-ink/40"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.image ? <img src={x.image} alt="" className="h-12 w-12 rounded-sm object-cover" /> : <span className="h-12 w-12 rounded-sm bg-ink" />}
              <span className="w-full truncate text-[0.65rem] text-paper/90">{x.name}</span>
            </li>
          );
        })}
      </ul>
      <ol className="grid gap-3 sm:grid-cols-2">
        {clue.inventories.map((inv, i) => {
          const locked = clue.locked[i];
          const h = hero(pick[i]);
          return (
            <li key={i} className={`rounded-sm border p-3 ${locked ? "border-ecto/60 bg-ecto/5" : "border-brass/30 bg-ink/40"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="smallcaps text-xs text-brass">Inventory {i + 1}</span>
                {inv.souls !== null && <span className="font-mono text-xs text-ash">{inv.souls.toLocaleString("en-US")} souls</span>}
              </div>
              <ul className="mb-2 grid grid-cols-6 gap-1">
                {inv.items.map((it, k) => (
                  <li key={k} className={`aspect-square rounded-[2px] bg-ink/70 p-0.5 ${it ? `slot-edge-${it.slot}` : "border border-dashed border-brass/25"}`} title={it?.name ?? "Hidden item"}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it ? <img src={it.image ?? ""} alt={it.name} className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center font-display text-xs text-brass/50">?</span>}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h?.image ? <img src={h.image} alt="" className="h-8 w-8 rounded-sm object-cover" /> : <span className="h-8 w-8 rounded-sm border border-dashed border-brass/30" />}
                <span className="sr-only">Hero for inventory {i + 1}</span>
                <select
                  value={pick[i] ?? ""}
                  disabled={!!locked || done || disabled}
                  onChange={(e) => assign(i, e.target.value)}
                  className="min-h-11 flex-1 rounded-sm border border-brass/40 bg-ink px-2 text-paper disabled:opacity-80"
                >
                  <option value="">Choose a hero…</option>
                  {clue.heroes.map((x) => (
                    <option key={x.id} value={x.id} disabled={clue.locked.includes(x.id) && locked !== x.id}>{x.name}</option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ol>
      {onGuess && !done && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={!complete || busy || disabled}
            onClick={() => onGuess(pick.join(","))}
            className="min-h-12 rounded-[3px] border border-ecto/70 bg-ecto/10 px-6 text-ecto hover:bg-ecto/20 disabled:opacity-40"
          >
            Submit the six
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────── The Constellation ─────────────

export function ConstellationStage({ clue, entries, onGuess, busy, disabled, done }: { clue: Extract<Clue, { kind: "constellation" }>; entries: CatalogEntry[] } & Play) {
  const firstEmpty = useMemo(() => clue.cells.findIndex((c) => !c), [clue.cells]);
  const [cell, setCell] = useState<number | null>(null);
  const active = cell !== null && !clue.cells[cell] ? cell : firstEmpty >= 0 ? firstEmpty : null;
  const placed = useMemo(() => new Set(clue.cells.flatMap((c) => (c ? [c.id] : []))), [clue.cells]);
  // The server resolves the typed name, so the picked suggestion is sent by its name.
  const place = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (active === null || !entry || !onGuess) return false;
    const ok = await onGuess(`${active}:${entry.name}`);
    setCell(null);
    return ok;
  };
  const head = (f: { label: string; info: string }, i: number) => (
    <div key={i} title={f.info} className="flex min-h-14 items-center justify-center rounded-sm border border-cursed/40 bg-cursed/10 p-1.5 text-center text-[0.7rem] leading-tight text-paper sm:text-sm">
      {f.label}
    </div>
  );
  return (
    <div className="clue-layer space-y-4">
      <div className="mx-auto grid max-w-xl grid-cols-[minmax(0,0.9fr)_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2">
        <div />
        {clue.cols.map(head)}
        {clue.rows.map((r, ri) => (
          <div key={ri} className="contents">
            {head(r, ri)}
            {[0, 1, 2].map((ci) => {
              const i = ri * 3 + ci;
              const h = clue.cells[i];
              const sol = clue.solution?.[i];
              return (
                <div key={ci} className="relative">
                <button
                  type="button"
                  disabled={!!h || done || disabled}
                  onClick={() => setCell(i)}
                  aria-label={`Row ${ri + 1} ${r.label}, column ${ci + 1} ${clue.cols[ci].label}: ${h ? h.name : sol ? `unfilled, for example ${sol.name}` : "empty"}`}
                  aria-pressed={active === i}
                  className={`relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-sm border text-center ${h ? "border-ecto/60 bg-ecto/10" : active === i && !done ? "border-ecto bg-ink shadow-[0_0_14px_rgba(127,227,194,0.35)]" : "border-brass/30 bg-ink/50 hover:border-brass/70"}`}
                >
                  {h ? (
                    <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-1 p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {h.image && <img src={h.image} alt="" className="h-10 w-10 rounded-sm object-cover sm:h-14 sm:w-14" />}
                      <span className="line-clamp-1 text-[0.65rem] text-paper sm:text-xs">{h.name}</span>
                    </motion.span>
                  ) : sol ? (
                    <span className="flex flex-col items-center gap-1 p-1 opacity-60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {sol.image && <img src={sol.image} alt="" className="h-9 w-9 rounded-sm object-cover grayscale sm:h-12 sm:w-12" />}
                      <span className="line-clamp-1 text-[0.6rem] text-ash sm:text-xs">{sol.name}</span>
                    </span>
                  ) : (
                    <span className="font-display text-2xl text-brass/40">✦</span>
                  )}
                </button>
                {h && onGuess && !done && (
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => { setCell(i); void onGuess(`-${i}`); }}
                    aria-label={`Take ${h.name} off row ${ri + 1}, column ${ci + 1}`}
                    title="Take off"
                    className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-sm text-ash hover:text-paper disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {clue.stuck && (
        <p role="alert" className="mx-auto max-w-xl rounded-sm border border-[#b0433f]/60 bg-[#b0433f]/10 px-3 py-2 text-center text-sm text-[#f0b3b0]">
          This grid can&apos;t be completed with the heroes on the board. Take one off (✕) to carry on.
        </p>
      )}
      {onGuess && !done && active !== null && (
        <div className="mx-auto max-w-xl">
          <GuessInput
            entries={entries} guessed={placed} onGuess={place} busy={busy} disabled={disabled} keepFocus autoFocus
            placeholder={`Cell ${active + 1}: ${clue.rows[Math.floor(active / 3)].label} × ${clue.cols[active % 3].label}`}
          />
        </div>
      )}
      {!done && <p className="text-center text-xs text-ash">Each hero fits one cell only.</p>}
    </div>
  );
}

