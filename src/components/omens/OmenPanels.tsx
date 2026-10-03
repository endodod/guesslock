"use client";
// Team panels: per hero portrait, level, exact HP and net worth, ultimate state and items.
// Hover syncs with the map; in The Clash, heroes can be picked here as well as on the map.
import { useState } from "react";
import type { OmenSnapshot, SnapshotHero, Team } from "@/lib/omens/types";
import { TEAM_COLOR } from "./OmenMap";

export type OmenCatalog = {
  heroes: Record<number, { name: string; icon: string | null }>;
  items: Record<number, { name: string; icon: string | null; slot?: string }>;
};

/** Per hero key: the playback frame's health and death state, overriding the snapshot's. */
export type LiveHero = { hp: number; maxHp: number; alive: boolean; respawnIn: number };

export const TEAM_LABEL: Record<Team, string> = { amber: "Amber", sapphire: "Sapphire" };
const nw = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function HeroRow({
  h: snap, live, cat, showName, hovered, selected, onHover, onToggle, selectable,
}: {
  h: SnapshotHero; live?: LiveHero; cat: OmenCatalog; showName: boolean; hovered: boolean; selected: boolean;
  onHover: (k: number | null) => void; onToggle?: (k: number) => void; selectable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const h = live ? { ...snap, ...live } : snap;
  const hero = cat.heroes[h.heroId];
  const pct = h.maxHp ? h.hp / h.maxHp : 0;
  return (
    <li
      onPointerEnter={() => onHover(h.key)}
      onPointerLeave={() => onHover(null)}
      className={`rounded-sm border px-2 py-1.5 transition-colors ${hovered ? "border-brass/70 bg-brass/10" : h.alive ? "border-brass/15 bg-ink/40" : "border-[#c0474f]/40 bg-[#c0474f]/10"} ${selected ? "ring-1 ring-[#e05a5a]" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (selectable ? onToggle?.(h.key) : setOpen((o) => !o))}
          aria-pressed={selectable ? selected : undefined}
          aria-label={selectable ? `Pick ${showName ? hero?.name ?? "hero" : `hero ${h.key + 1}`} as dying` : undefined}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2"
          style={{ borderColor: TEAM_COLOR[h.team] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {hero?.icon && <img src={hero.icon} alt="" className={`h-full w-full object-cover ${h.alive ? "" : "grayscale"}`} />}
          {!h.alive && <span className="absolute inset-0 flex items-center justify-center bg-ink/60 font-mono text-sm text-paper" aria-hidden>{h.respawnIn ? `${h.respawnIn}s` : "✝"}</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-paper">{showName ? hero?.name ?? "Unknown" : <span className="text-ash">Lv {h.level}</span>}</span>
            <span className="shrink-0 font-mono text-xs text-brass" title="Net worth (souls)">{nw(h.netWorth)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink" aria-hidden>
              <div className="h-full rounded transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: pct > 0.5 ? "#6fd08c" : pct > 0.25 ? "#e3c14f" : "#e05a5a" }} />
            </div>
            {h.alive ? (
              <span className="shrink-0 font-mono text-[0.68rem] text-ash">{h.hp}/{h.maxHp}</span>
            ) : (
              <span className="shrink-0 font-mono text-[0.68rem] text-[#e07a7a]">✝ dead{h.respawnIn ? ` · ${h.respawnIn}s` : ""}</span>
            )}
            <span
              className={`shrink-0 rounded-sm px-1 font-mono text-[0.65rem] ${h.ultIn === 0 ? "bg-cursed/30 text-paper" : "text-ash"}`}
              title={h.ultIn === null ? "Ultimate not trained" : h.ultIn === 0 ? "Ultimate ready" : `Ultimate ready in ${h.ultIn}s`}
            >
              {h.ultIn === null ? "ult —" : h.ultIn === 0 ? "ULT" : `ult ${h.ultIn}s`}
            </span>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 flex w-full flex-wrap gap-0.5" aria-label="Show items">
        {h.items.map((id, i) => {
          const it = cat.items[id];
          return it?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={it.icon} alt={it.name} title={it.name} className={`h-5 w-5 rounded-[2px] bg-ink object-contain slot-edge-${it.slot ?? "spirit"}`} />
          ) : (
            <span key={i} className="h-5 w-5 rounded-[2px] bg-ink" title={it?.name ?? "Item"} />
          );
        })}
        {!h.items.length && <span className="text-[0.7rem] text-ash">No items</span>}
      </button>
      {open && h.items.length > 0 && (
        <ul className="mt-1 grid grid-cols-2 gap-x-2 text-[0.72rem] text-paper/85">
          {h.items.map((id, i) => <li key={i} className="truncate">{cat.items[id]?.name ?? `Item ${id}`}</li>)}
        </ul>
      )}
    </li>
  );
}

export function TeamPanel({
  team, snapshot, cat, showNames, hovered, onHover, selected, onToggle, selectable, live,
}: {
  team: Team; snapshot: OmenSnapshot; cat: OmenCatalog; showNames: boolean; live?: Record<number, LiveHero>;
  hovered: number | null; onHover: (k: number | null) => void;
  selected?: Set<number>; onToggle?: (k: number) => void; selectable?: boolean;
}) {
  const t = snapshot.teams[team];
  const other = snapshot.teams[team === "amber" ? "sapphire" : "amber"];
  const diff = t.netWorth - other.netWorth;
  return (
    <section aria-label={`${TEAM_LABEL[team]} team`} className="rounded-sm border border-brass/25 bg-iron/60 p-2">
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="font-display text-lg" style={{ color: TEAM_COLOR[team] }}>{TEAM_LABEL[team]}</h3>
        <div className="text-right font-mono text-xs leading-tight">
          <div className="text-paper">{t.netWorth.toLocaleString("en-US")} <span className="text-ash">souls</span></div>
          <div className={diff >= 0 ? "text-ecto" : "text-[#d08a8a]"}>{diff >= 0 ? "+" : "−"}{Math.abs(diff).toLocaleString("en-US")}</div>
        </div>
      </header>
      <p className="mb-2 flex items-center gap-2 px-1 text-xs text-ash">
        Rejuvs: <span className="font-mono text-paper">{t.rejuvs}</span>
        {t.rejuvActive && <span className="rounded-sm bg-cursed/25 px-1.5 text-paper">Rejuv buff active</span>}
      </p>
      <ul className="space-y-1">
        {snapshot.heroes.filter((h) => h.team === team).map((h) => (
          <HeroRow
            key={h.key} h={h} live={live?.[h.key]} cat={cat} showName={showNames} hovered={hovered === h.key} selected={!!selected?.has(h.key)}
            onHover={onHover} onToggle={onToggle} selectable={selectable}
          />
        ))}
      </ul>
    </section>
  );
}
