"use client";
// Guess history: AttributeGrid for the attribute locks, compact rows elsewhere. Newest on top.
import { useState } from "react";
import { motion } from "motion/react";
import type { ColumnMeta, GuessRow, HintView, Tile } from "@/lib/engine/types";
import { Icon } from "./ui";
import { AudioButton } from "./ClueStage";
import { t } from "@/lib/i18n/en";

function TileCell({ tile, index, animate }: { tile: Tile; index: number; animate: boolean }) {
  const icon = tile.arrow ?? (tile.result === "match" ? "check" : tile.result === "partial" ? "approx" : "cross");
  const label = `${tile.display}: ${tile.result === "match" ? "match" : tile.result === "partial" ? "partial match" : "no match"}${tile.arrow ? `, answer is ${tile.arrow === "up" ? "higher" : "lower"}` : ""}`;
  return (
    <motion.td
      initial={animate ? { rotateY: 90, opacity: 0 } : false}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay: animate ? index * 0.12 : 0, duration: 0.3 }}
      className="p-0.5"
    >
      <div aria-label={label} className={`tile-${tile.result} flex h-16 min-w-[4.6rem] flex-col items-center justify-center rounded-sm px-1 text-center`}>
        <span className="line-clamp-2 text-[0.8rem] font-semibold leading-tight">{tile.display}</span>
        <Icon name={icon as "check"} className="mt-0.5 h-4 w-4 opacity-80" />
      </div>
    </motion.td>
  );
}

export function AttributeGrid({ columns, rows }: { columns: ColumnMeta[]; rows: GuessRow[] }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  // Rows restored on mount appear instantly; rows added afterwards reveal tile by tile.
  const [mountCount] = useState(rows.length);
  if (!rows.length) return null;
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table className="w-full border-separate border-spacing-0 [perspective:800px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-ink p-1 text-left text-xs font-normal text-ash">{t.lock.guesses}</th>
            {columns.map((c) => (
              <th key={c.key} className="relative p-1 text-xs font-normal text-ash">
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap hover:text-paper"
                  onClick={() => setOpenInfo(openInfo === c.key ? null : c.key)}
                  aria-expanded={openInfo === c.key}
                >
                  {c.label}
                  <Icon name="info" className="h-3.5 w-3.5 text-brass/80" />
                </button>
                {openInfo === c.key && (
                  <div role="tooltip" className="deco absolute left-1/2 top-full z-20 w-48 -translate-x-1/2 rounded-sm p-2 text-left text-xs text-paper shadow-xl">
                    {c.info}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => {
            const idx = rows.indexOf(r);
            return (
              <tr key={r.id}>
                <th scope="row" className="sticky left-0 z-10 bg-ink p-0.5">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-sm border ${r.correct ? "border-ecto" : "border-brass/30"} bg-iron`} title={r.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.icon ? <img src={r.icon} alt={r.name} className="h-14 w-14 object-contain" /> : <span className="text-xs">{r.name}</span>}
                  </div>
                </th>
                {(r.tiles ?? []).map((tile, i) => <TileCell key={tile.key} tile={tile} index={i} animate={idx >= mountCount} />)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GuessList({ rows, numeric }: { rows: GuessRow[]; numeric?: boolean }) {
  if (!rows.length) return null;
  return (
    <ul className="space-y-1.5">
      {[...rows].reverse().map((r) => (
        <motion.li
          key={r.id}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`flex min-h-12 items-center gap-3 rounded-sm border px-3 py-1.5 ${r.correct ? "border-ecto/60 bg-ecto/10" : "border-brass/15 bg-iron/60"}`}
        >
          {r.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.icon} alt="" className="h-9 w-9 rounded-sm object-contain" />
          )}
          <span className={`flex-1 ${numeric ? "font-mono text-lg" : ""}`}>
            {r.name}
            {r.sub && <span className="ml-2 text-xs text-ash">{r.sub}</span>}
          </span>
          {r.arrow && (
            <span className="tile-miss flex h-8 items-center gap-1 rounded-sm px-2 text-sm">
              <Icon name={r.arrow} className="h-4 w-4" /> {r.arrow === "up" ? "Higher" : "Lower"}
            </span>
          )}
          {r.correct ? (
            <span className="flex items-center gap-1 text-ecto"><Icon name="check" className="h-5 w-5" />{r.close && <span className="text-xs">{t.lock.within}</span>}</span>
          ) : (
            !r.arrow && <Icon name="cross" className="h-5 w-5 text-[#c86a6a]" />
          )}
        </motion.li>
      ))}
    </ul>
  );
}

export function HintShelf({ hints, hidden }: { hints: HintView[]; hidden?: boolean }) {
  if (!hints.length || hidden) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {hints.map((h) => (
        <li key={h.id} className={`overflow-hidden rounded-sm border ${h.unlocked ? "border-brass/60 bg-iron" : "border-brass/20 bg-iron/40"}`}>
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <Icon name={h.unlocked ? "unlock" : "lock"} className={`h-4 w-4 ${h.unlocked ? "text-brass" : "text-ash"}`} />
            <span className={h.unlocked ? "text-paper" : "text-ash"}>{h.label}</span>
            {h.unlocked && <span className="smallcaps ml-auto text-[0.7rem] text-brass">{t.lock.hintRevealed}</span>}
          </div>
          <motion.div
            initial={false}
            animate={{ height: h.unlocked ? "auto" : "auto" }}
            className="border-t border-brass/10 px-3 py-2"
          >
            {h.unlocked ? (
              <div className="flex items-center gap-3">
                {h.value && <span className="text-lg text-paper">{h.value}</span>}
                {h.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image} alt="Hint image" className="h-14 w-14 rounded bg-ink object-contain p-1 blur-[4px]" />
                )}
                {h.audio && <AudioButton src={h.audio} />}
              </div>
            ) : (
              <span className="text-xs text-ash">{t.lock.hintLocked(h.after)}</span>
            )}
          </motion.div>
        </li>
      ))}
    </ul>
  );
}
