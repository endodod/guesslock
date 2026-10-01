import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate, dayIndex } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData } from "@/lib/engine/context";
import { MODES } from "@/lib/engine/registry";
import type { BasePayload } from "@/lib/engine/mode";
import { CalendarCell } from "./CalendarCell";
import Link from "next/link";
import type { SeancePayload } from "@/lib/seance/types";

/** The Resonance: the day's clips (and gun hint) for a quick listen, plus the ability behind them. */
function soundPreview(p: BasePayload): { clips: { label: string; url: string }[]; ability?: string } | undefined {
  if (p.mode !== "hero-sound") return undefined;
  const clue = p.clue as { clips: { url: string }[]; gun?: { url: string } | null };
  const clips = clue.clips.map((c, i) => ({ label: `Sound ${i + 1}`, url: c.url }));
  if (clue.gun) clips.push({ label: "Gun", url: clue.gun.url });
  return { clips, ability: p.bonus?.reveal?.name };
}

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
        Today and the next 7 days (The Omens: see Omens). Overrides freeze a chosen answer. Future days can be regenerated (e.g. after curation). Live days are never regenerated automatically.
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
            {/* The Omens have their own calendar in /admin/omens (no engine mode here). */}
            {LOCKS.filter((l) => l.group !== "omens").map((l) => (
              <tr key={l.slug} className="border-t border-neutral-200 align-top">
                <td className="p-2 font-medium">{l.numeral} {l.name}{l.table ? ` · ${l.table.label}` : ""}</td>
                {days.map((d) => {
                  const r = by.get(`${d}|${l.slug}`);
                  // The Séance: boards come from the category library; preview/override on /admin/seance/preview.
                  if (l.box === "seance") {
                    const p = r && !r.sealed ? (r.payload as unknown as SeancePayload) : null;
                    return (
                      <td key={d} className="min-w-44 p-2 text-xs">
                        {!r ? <span className="text-neutral-400">not generated</span>
                          : r.sealed ? <span className="text-red-700" title={r.sealedReason ?? ""}>sealed</span>
                          : <span>{p!.groups.map((g) => g.label).join(" · ")}{r.overridden && <span className="ml-1 text-blue-700">(override)</span>}</span>}
                        <div className="mt-1">
                          <Link className="text-blue-700 hover:underline" href={`/admin/seance/preview?date=${d}&table=${l.table!.kind}`}>preview / override</Link>
                        </div>
                      </td>
                    );
                  }
                  if (!MODES[l.mode]) {
                    // The Omens have their own calendar on /admin/omens.
                    return (
                      <td key={d} className="min-w-44 p-2 text-xs">
                        {!r ? <span className="text-neutral-400">not generated</span> : r.sealed ? <span className="text-red-700">sealed</span> : r.answerId}
                        <div className="mt-1"><Link className="text-blue-700 hover:underline" href="/admin/omens">Omens admin</Link></div>
                      </td>
                    );
                  }
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
                        preview={r && !r.sealed ? soundPreview(r.payload as unknown as BasePayload) : undefined}
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
