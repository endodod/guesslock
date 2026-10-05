"use client";
// The word locks' stages, which are also their input: The Lexicon (a Wordle board with its own keyboard) and The
// Crossword (a fillable grid with a Check button).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Clue, GuessRow, TileResult } from "@/lib/engine/types";
import { DecoFrame } from "./ui";

/** `onGuess` resolves true when the lock opened; a refused move leaves the view unchanged. */
type Play = { onGuess?: (id: string) => Promise<boolean>; busy?: boolean; disabled?: boolean; done?: boolean };

const TILE: Record<TileResult, string> = { match: "tile-match", partial: "tile-partial", miss: "tile-miss", hidden: "tile-hidden" };
const RANK: Record<TileResult, number> = { hidden: 0, miss: 1, partial: 2, match: 3 };

// ───────────── The Lexicon ─────────────

const KEYS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function LexiconStage({ clue, rows, onGuess, busy, disabled, done }: { clue: Extract<Clue, { kind: "lexicon" }>; rows: GuessRow[] } & Play) {
  const [cur, setCur] = useState("");
  // A taken guess clears the row being typed.
  const taken = rows.length;
  const [seen, setSeen] = useState(taken);
  if (seen !== taken) { setSeen(taken); setCur(""); }

  const keyState = useMemo(() => {
    const m = new Map<string, TileResult>();
    for (const r of rows) for (const t of r.tiles ?? []) {
      const prev = m.get(t.display);
      if (!prev || RANK[t.result] > RANK[prev]) m.set(t.display, t.result);
    }
    return m;
  }, [rows]);

  const locked = done || disabled || !onGuess;
  const press = useCallback((k: string) => {
    if (locked || busy) return;
    if (k === "ENTER") { if (cur.length === clue.length) void onGuess!(cur); return; }
    if (k === "BACK") { setCur((c) => c.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(k)) setCur((c) => (c.length < clue.length ? c + k : c));
  }, [locked, busy, cur, clue.length, onGuess]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Enter") press("ENTER");
      else if (e.key === "Backspace") press("BACK");
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const lines: { tiles: { ch: string; cls: string }[]; live?: boolean }[] = rows.map((r) => ({
    tiles: (r.tiles ?? []).map((t) => ({ ch: t.display, cls: TILE[t.result] })),
  }));
  if (!done && lines.length < clue.tries) {
    lines.push({ live: true, tiles: Array.from({ length: clue.length }, (_, i) => ({ ch: cur[i] ?? "", cls: cur[i] ? "border border-brass/70 bg-ink" : "border border-brass/25 bg-ink/50" })) });
  }
  while (lines.length < clue.tries) lines.push({ tiles: Array.from({ length: clue.length }, () => ({ ch: "", cls: "border border-brass/15 bg-ink/30" })) });

  return (
    <div className="clue-layer space-y-5">
      <p className="text-center text-sm text-ash">{clue.length} letters</p>
      <div className="mx-auto grid w-fit gap-1.5" role="grid" aria-label="Your guesses">
        {lines.map((l, ri) => (
          <div key={ri} role="row" className="flex gap-1.5">
            {l.tiles.map((t, ci) => (
              <motion.div
                key={ci} role="gridcell"
                initial={false}
                animate={t.ch && l.live ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.12 }}
                className={`flex h-11 w-11 items-center justify-center rounded-sm font-mono text-xl font-semibold sm:h-13 sm:w-13 ${t.cls}`}
              >
                {t.ch}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
      {!done && onGuess && (
        <div className="mx-auto max-w-lg space-y-1.5" aria-label="Keyboard">
          {KEYS.map((row, i) => (
            <div key={row} className="flex justify-center gap-1">
              {i === 2 && <Key label="Enter" wide onClick={() => press("ENTER")} disabled={locked || busy || cur.length !== clue.length} />}
              {[...row].map((k) => {
                const s = keyState.get(k);
                return <Key key={k} label={k} cls={s ? TILE[s] : undefined} onClick={() => press(k)} disabled={locked || busy} />;
              })}
              {i === 2 && <Key label="⌫" aria="Delete" wide onClick={() => press("BACK")} disabled={locked || busy || !cur} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Key({ label, aria, cls, wide, onClick, disabled }: { label: string; aria?: string; cls?: string; wide?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={aria ?? label}
      className={`flex h-12 min-w-0 items-center justify-center rounded-[3px] font-mono text-sm disabled:opacity-60 ${wide ? "flex-[1.5] px-1 text-xs" : "flex-1"} ${cls ?? "border border-brass/30 bg-iron text-paper hover:border-brass/70"}`}
    >
      {label}
    </button>
  );
}

// ───────────── The Crossword ─────────────

type Word = Extract<Clue, { kind: "crossword" }>["words"][number];
const cellsOf = (w: Word) => Array.from({ length: w.len }, (_, i) => (w.dir === "across" ? `${w.x + i},${w.y}` : `${w.x},${w.y + i}`));

export function CrosswordStage({ clue, onGuess, busy, disabled, done }: { clue: Extract<Clue, { kind: "crossword" }> } & Play) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  // Letters of solved words are fixed; everything else is what the player typed.
  const fixed = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of clue.words) if (w.solved) cellsOf(w).forEach((c, i) => m.set(c, w.solved![i]));
    return m;
  }, [clue.words]);
  const numbers = useMemo(() => new Map(clue.words.map((w) => [`${w.x},${w.y}`, w.n])), [clue.words]);
  const wordsAt = useMemo(() => {
    const m = new Map<string, number[]>();
    clue.words.forEach((w, i) => cellsOf(w).forEach((c) => m.set(c, [...(m.get(c) ?? []), i])));
    return m;
  }, [clue.words]);
  const letter = (c: string) => fixed.get(c) ?? typed[c] ?? "";
  const activeCells = useMemo(() => new Set(cellsOf(clue.words[active])), [clue.words, active]);
  const locked = done || disabled || !onGuess;

  const focus = (c: string | undefined) => {
    if (!c) return;
    setCursor(c);
    inputs.current.get(c)?.focus({ preventScroll: true });
  };
  const select = (i: number) => {
    setActive(i);
    const cells = cellsOf(clue.words[i]);
    focus(cells.find((c) => !letter(c)) ?? cells[0]);
  };
  const onCell = (c: string) => {
    const ws = wordsAt.get(c) ?? [];
    // Tapping the cursor's cell again switches between its across and down word.
    if (c === cursor && ws.length > 1) setActive(ws.find((w) => w !== active) ?? active);
    else if (!ws.includes(active)) setActive(ws[0]);
    setCursor(c);
  };
  const move = (from: string, by: number) => {
    const cells = cellsOf(clue.words[active]);
    let i = cells.indexOf(from) + by;
    while (i >= 0 && i < cells.length && fixed.has(cells[i])) i += by;
    if (i >= 0 && i < cells.length) focus(cells[i]);
  };
  const type = (c: string, ch: string) => {
    if (locked || fixed.has(c)) return;
    setTyped((t) => ({ ...t, [c]: ch }));
    if (ch) move(c, 1);
  };

  const check = useMemo(() => clue.words.map((w) => cellsOf(w).map((c) => letter(c) || ".").join("")), [clue.words, fixed, typed]); // eslint-disable-line react-hooks/exhaustive-deps
  const newWord = clue.words.some((w, i) => !w.solved && !check[i].includes("."));
  const solvedCount = clue.words.filter((w) => w.solved).length;

  const grid = Array.from({ length: clue.h }, (_, y) => Array.from({ length: clue.w }, (_, x) => `${x},${y}`));
  const list = (dir: "across" | "down") => clue.words.map((w, i) => ({ w, i })).filter(({ w }) => w.dir === dir);

  return (
    <div className="clue-layer space-y-4">
      <div className="mx-auto w-full max-w-md">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${clue.w}, minmax(0, 1fr))` }}>
          {grid.flat().map((c) => {
            if (!wordsAt.has(c)) return <div key={c} className="aspect-square" aria-hidden />;
            const isFixed = fixed.has(c);
            const n = numbers.get(c);
            return (
              <div key={c} className="relative aspect-square">
                {n && <span className="pointer-events-none absolute left-0.5 top-0 z-10 font-mono text-[0.5rem] leading-none text-ash sm:text-[0.6rem]">{n}</span>}
                <input
                  ref={(el) => { if (el) inputs.current.set(c, el); else inputs.current.delete(c); }}
                  value={letter(c)}
                  readOnly={isFixed || locked}
                  maxLength={2}
                  inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  aria-label={`Cell ${c}${n ? `, word ${n}` : ""}`}
                  onFocus={() => onCell(c)}
                  onClick={() => onCell(c)}
                  onChange={(e) => {
                    const ch = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
                    type(c, ch);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !letter(c) && !isFixed) { e.preventDefault(); move(c, -1); }
                    else if (e.key === "Backspace" && isFixed) { e.preventDefault(); move(c, -1); }
                    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(c, 1); }
                    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(c, -1); }
                    else if (e.key === "Enter" && newWord && !locked && !busy) { e.preventDefault(); void onGuess!(check.join("|")); }
                  }}
                  className={`h-full w-full rounded-[2px] text-center font-mono text-sm font-semibold uppercase caret-transparent outline-none sm:text-lg ${
                    isFixed ? "tile-match" : c === cursor && !locked ? "border border-ecto bg-ecto/15 text-paper" : activeCells.has(c) && !locked ? "border border-brass/60 bg-brass/10 text-paper" : "border border-brass/25 bg-ink text-paper"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {!done && onGuess && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <p className="text-sm text-ash">{solvedCount} / {clue.words.length} words</p>
          <button
            type="button" disabled={!newWord || locked || busy} onClick={() => void onGuess(check.join("|"))}
            className="min-h-11 rounded-[3px] border border-ecto/70 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20 disabled:opacity-40"
          >
            Check
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["across", "down"] as const).map((dir) => (
          <DecoFrame key={dir} className="p-3" corners={false}>
            <p className="smallcaps mb-2 text-xs text-brass">{dir === "across" ? "Across" : "Down"}</p>
            <ol className="space-y-1.5 text-sm">
              {list(dir).map(({ w, i }) => (
                <li key={i}>
                  <button
                    type="button" onClick={() => select(i)} disabled={locked && !done}
                    className={`w-full rounded-sm px-2 py-1.5 text-left leading-snug ${i === active && !done ? "bg-brass/15" : "hover:bg-brass/10"} ${w.solved && !done ? "text-ash" : "text-paper/90"}`}
                  >
                    <span className="mr-1.5 font-mono text-brass">{w.n}</span>
                    {w.clue}
                    <span className="ml-1 font-mono text-xs text-ash">({w.len})</span>
                    {done && w.answer && <span className="mt-0.5 block text-xs text-ecto">{w.answer.name}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </DecoFrame>
        ))}
      </div>
    </div>
  );
}
