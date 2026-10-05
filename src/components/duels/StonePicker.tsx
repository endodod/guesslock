"use client";
// Picks a playing stone for a duel: a hero whose portrait goes on your pieces, or the plain soul orb. The last pick is
// remembered in this browser, so a regular keeps their hero without choosing it every game.
import { useState, useSyncExternalStore } from "react";
import type { Seat } from "@/lib/duels/games";
import type { Stone } from "@/lib/duels/service";
import { Orb } from "./Boards";

const KEY = "gl-duel-stone";

// The pick lives here for this page's lifetime (so it works with storage blocked) and in localStorage across visits.
let picked: string | null | undefined;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
function read(): string | null {
  if (picked === undefined) {
    try { picked = localStorage.getItem(KEY); } catch { picked = null; }
  }
  return picked;
}

/** The stone picked last time (null: the soul orb), if it's still a hero that can be picked. */
export function useStone(heroes: Stone[]): [number | null, (id: number | null) => void] {
  const saved = useSyncExternalStore(subscribe, read, () => null);
  const stone = saved !== null && heroes.some((h) => h.id === Number(saved)) ? Number(saved) : null;
  const pick = (id: number | null) => {
    picked = id === null ? null : String(id);
    try { if (id === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(id)); } catch { /* not remembered */ }
    listeners.forEach((f) => f());
  };
  return [stone, pick];
}

export function StonePicker({ heroes, value, onChange, seat }: { heroes: Stone[]; value: number | null; onChange: (id: number | null) => void; seat: Seat }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = heroes.find((h) => h.id === value) ?? null;
  const shown = query.trim() ? heroes.filter((h) => h.name.toLowerCase().includes(query.trim().toLowerCase())) : heroes;
  const choose = (id: number | null) => { onChange(id); setOpen(false); setQuery(""); };
  const option = (id: number | null, label: string, stone: Stone | null) => (
    <button
      key={id ?? "orb"} type="button" role="radio" aria-checked={value === id} onClick={() => choose(id)} title={label}
      className={`flex flex-col items-center gap-1 rounded-sm border p-1.5 ${value === id ? "border-brass bg-brass/15" : "border-transparent hover:border-brass/50"}`}
    >
      <Orb seat={seat} stone={stone} className="h-10 w-10" />
      <span className="w-full truncate text-center text-[0.65rem] text-ash">{label}</span>
    </button>
  );
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 items-center gap-3 rounded-[3px] border border-brass/30 px-3 py-1.5 hover:border-brass/70">
        <Orb seat={seat} stone={current} className="h-8 w-8" />
        <span className="text-left">
          <span className="block text-xs text-ash">Your playing stone</span>
          <span className="block text-paper">{current?.name ?? "Soul orb"}</span>
        </span>
        <span className="ml-2 text-sm text-brass">{open ? "Close" : "Change"}</span>
      </button>
      {open && (
        <div className="space-y-2 rounded-sm border border-brass/25 bg-ink/60 p-2">
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a hero" aria-label="Find a hero" maxLength={30}
            className="min-h-10 w-full rounded-[3px] border border-brass/40 bg-ink/80 px-3 text-sm text-paper"
          />
          <div role="radiogroup" aria-label="Playing stone" className="grid max-h-64 grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-6">
            {!query.trim() && option(null, "Soul orb", null)}
            {shown.map((h) => option(h.id, h.name, h))}
          </div>
          {!shown.length && <p className="px-1 text-sm text-ash">No hero by that name.</p>}
        </div>
      )}
    </div>
  );
}
