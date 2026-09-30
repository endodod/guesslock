import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate, dayIndex } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData } from "@/lib/engine/context";
import { MODES } from "@/lib/engine/registry";
import type { BasePayload } from "@/lib/engine/mode";
import { CalendarCell } from "./CalendarCell";

export default async function CalendarAdmin() {
  await requireAdminPage();
  const today = todayDate();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const [rows, data] = await Promise.all([
    db.dailyPuzzle.findMany({ where: { date: { in: days } } }),
    loadGameData(),
  ]);
  const by = new Map(rows.map((r) => [`${r.date}|${r.mode}`, r]));

  // Candidate names per lock (per day for The Lineage, whose direction alternates).
  const nameOf = (lockMode: string, answerId: string) => {
    const [, raw] = answerId.includes(":") ? answerId.split(":") : ["", answerId];
    const id = Number(raw);
    if (lockMode === "upgrades") return data.ability(id)?.name ?? answerId;
    if (["item-picture", "item-classic", "build-path", "stat-bonus"].includes(lockMode)) return data.item(id)?.name ?? answerId;
    return data.hero(id)?.name ?? answerId;
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Puzzle calendar</h1>
      <p className="text-xs text-neutral-500">
        Today and the next 7 days. Overrides freeze a chosen answer. Future days can be regenerated (e.g. after curation). Live days are never regenerated automatically.
      </p>
      <div className="overflow-x-auto rounded border border-neutral-300 bg-white">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="p-2">Lock</th>
              {days.map((d) => <th key={d} className="p-2">{d === today ? `${d} (today)` : d}</th>)}
            </tr>
          </thead>
          <tbody>
            {LOCKS.map((l) => (
              <tr key={l.slug} className="border-t border-neutral-200 align-top">
                <td className="p-2 font-medium">{l.numeral} {l.name}</td>
                {days.map((d) => {
                  const r = by.get(`${d}|${l.slug}`);
                  const options = MODES[l.mode]
                    .candidates(data, { dayIndex: dayIndex(d) })
                    .map((c) => ({ id: c.answerId, name: nameOf(l.mode, c.answerId) }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                  return (
                    <td key={d} className="min-w-44 p-2">
                      <CalendarCell
                        date={d}
                        slug={l.slug}
                        isFuture={d > today}
                        current={r ? {
                          answerId: r.answerId,
                          name: r.sealed ? null : (r.payload as unknown as BasePayload).answer?.name ?? r.answerId,
                          sealed: r.sealed, sealedReason: r.sealedReason, overridden: r.overridden,
                        } : null}
                        options={options}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
