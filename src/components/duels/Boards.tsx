"use client";
// The three duel boards. Pieces are soul orbs: amber for seat 0 (the Amber Hand), sapphire for seat 1 (the Sapphire Flame).
// Each board only offers moves the rules allow; the server checks them again.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { C4_COLS, C4_ROWS, c4Winner, ckMoves, type C4State, type CkState, type Seat, type TttState } from "@/lib/duels/games";

type BoardProps<S, M> = { state: S; seat: Seat | null; myTurn: boolean; busy: boolean; onMove: (m: M) => void };

export const SEAT_NAME: Record<Seat, string> = { 0: "Amber Hand", 1: "Sapphire Flame" };
const ORB: Record<Seat, string> = {
  0: "bg-[radial-gradient(circle_at_35%_30%,#ffd28a,var(--amber)_55%,#7a4a10)] shadow-[0_0_10px_rgba(224,150,42,0.55)]",
  1: "bg-[radial-gradient(circle_at_35%_30%,#bcd0ff,var(--sapphire)_55%,#1d3270)] shadow-[0_0_10px_rgba(91,130,214,0.55)]",
};

export function Orb({ seat, king = false, className = "" }: { seat: Seat; king?: boolean; className?: string }) {
  return (
    <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`relative block rounded-full ${ORB[seat]} ${className}`}>
      {king && <span className="absolute inset-0 flex items-center justify-center font-display text-[0.7em] text-ink/80">♛</span>}
    </motion.span>
  );
}

// ───────────── Three Souls ─────────────

export function TicTacToeBoard({ state, myTurn, busy, onMove }: BoardProps<TttState, { cell: number }>) {
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
      {state.cells.map((c, i) => (
        <button
          key={i} type="button" disabled={!myTurn || busy || c !== null} onClick={() => onMove({ cell: i })}
          aria-label={`Square ${i + 1}${c === null ? "" : `, ${SEAT_NAME[c]}`}`}
          className={`flex aspect-square items-center justify-center rounded-sm border border-brass/30 bg-ink/60 ${myTurn && c === null && !busy ? "hover:border-ecto hover:bg-ecto/10" : ""}`}
        >
          {c !== null && <Orb seat={c} className="h-3/5 w-3/5" />}
        </button>
      ))}
    </div>
  );
}

// ───────────── Soul Wells ─────────────

export function Connect4Board({ state, myTurn, busy, onMove }: BoardProps<C4State, { col: number }>) {
  const [hover, setHover] = useState<number | null>(null);
  const full = (col: number) => state.grid[col] !== null;
  const winner = c4Winner(state.grid);
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="grid gap-1 rounded-md border border-brass/40 bg-[#1b1712] p-2" style={{ gridTemplateColumns: `repeat(${C4_COLS}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col} type="button" disabled={!myTurn || busy || full(col) || winner !== null} onClick={() => onMove({ col })} onMouseEnter={() => setHover(col)}
            aria-label={`Drop into well ${col + 1}`}
            className={`flex flex-col gap-1 rounded-sm p-0.5 ${hover === col && myTurn && !busy && !full(col) ? "bg-ecto/10" : ""}`}
          >
            {Array.from({ length: C4_ROWS }, (_, row) => {
              const c = state.grid[row * C4_COLS + col];
              return (
                <span key={row} className="flex aspect-square w-full items-center justify-center rounded-full bg-ink shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
                  {c !== null && <Orb seat={c} className="h-[82%] w-[82%]" />}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────── Patron's Gambit ─────────────

export function CheckersBoard({ state, seat, myTurn, busy, onMove }: BoardProps<CkState, { path: number[] }>) {
  const [from, setFrom] = useState<number | null>(null);
  const legal = useMemo(() => (myTurn && seat !== null ? ckMoves(state, seat) : []), [state, seat, myTurn]);
  const starts = new Set(legal.map((m) => m[0]));
  const ends = new Map(legal.filter((m) => m[0] === from).map((m) => [m[m.length - 1], m]));
  // The Sapphire Flame sees the board from their side.
  const flip = seat === 1;
  const order = Array.from({ length: 64 }, (_, i) => (flip ? 63 - i : i));
  const mustJump = legal.some((m) => Math.abs(Math.floor(m[0] / 8) - Math.floor(m[1] / 8)) === 2);
  return (
    <div className="mx-auto w-full max-w-md space-y-2">
      <div className="grid grid-cols-8 overflow-hidden rounded-md border border-brass/50">
        {order.map((i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const p = state.board[i];
          const isStart = starts.has(i);
          const target = ends.get(i);
          return (
            <button
              key={i} type="button"
              disabled={busy || !myTurn || (!isStart && !target)}
              onClick={() => { if (target) { onMove({ path: target }); setFrom(null); } else setFrom(from === i ? null : i); }}
              aria-label={`Square ${i}${p ? `, ${SEAT_NAME[p.s]}${p.k ? " king" : ""}` : ""}${target ? ", move here" : ""}`}
              className={`relative flex aspect-square items-center justify-center ${dark ? "bg-[#3a2b1e]" : "bg-[#c9b58c]"} ${from === i ? "ring-2 ring-inset ring-ecto" : isStart && !from ? "ring-1 ring-inset ring-ecto/50" : ""}`}
            >
              {p && <Orb seat={p.s} king={p.k} className="h-[72%] w-[72%]" />}
              {target && <span className="absolute h-1/3 w-1/3 rounded-full border-2 border-ecto bg-ecto/30" />}
            </button>
          );
        })}
      </div>
      {myTurn && mustJump && <p className="text-center text-xs text-ecto">A jump is on: you must take it.</p>}
    </div>
  );
}
