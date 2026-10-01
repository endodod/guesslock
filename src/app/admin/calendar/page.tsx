import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate, dayIndex } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData } from "@/lib/engine/context";
import { MODES } from "@/lib/engine/registry";
import type { BasePayload } from "@/lib/engine/mode";
import { CalendarCell } from "./CalendarCell";
import type { SeancePayload } from "@/lib/seance/types";
import { Card, PageHeader, Pill } from "../kit";

export const dynamic = "force-dynamic";

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
    <div className="space-y-6">
      <PageHeader
        title="Puzzle Calendar"
        subtitle="Today and the next 7 days across all lock modes. Overrides freeze a chosen answer. Omens scenarios are curated under Omens."
        actions={
          <Link href="/admin/omens" className="text-xs text-blue-700 hover:underline">
            Omens Scenarios ↗
          </Link>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50/90 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur">
              <tr>
                <th className="py-2.5 pl-3 pr-3">Lock</th>
                {days.map((d) => (
                  <th key={d} className={`min-w-40 px-3 py-2.5 ${d === today ? "bg-blue-50/60 font-bold text-blue-900" : ""}`}>
                    {d === today ? `${d} (Today)` : d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {LOCKS.filter((l) => l.group !== "omens").map((l) => (
                <tr key={l.slug} className="align-top transition hover:bg-neutral-50/60">
                  <td className="whitespace-nowrap py-3 pl-3 pr-3 font-medium text-neutral-900">
                    <span className="font-mono text-neutral-400">{l.numeral}.</span> {l.name}
                    {l.table ? <span className="ml-1 text-xs text-neutral-500">· {l.table.label}</span> : ""}
                  </td>
                  {days.map((d) => {
                    const r = by.get(`${d}|${l.slug}`);
                    if (l.box === "seance") {
                      const p = r && !r.sealed ? (r.payload as unknown as SeancePayload) : null;
                      return (
                        <td key={d} className={`px-3 py-3 text-xs ${d === today ? "bg-blue-50/30" : ""}`}>
                          {!r ? (
                            <Pill tone="slate">Not generated</Pill>
                          ) : r.sealed ? (
                            <Pill tone="red">Sealed</Pill>
                          ) : (
                            <div className="space-y-1">
                              <span className="font-medium text-neutral-800">
                                {p?.groups?.map((g) => g.label).join(" · ") ?? "Seance board"}
                              </span>
                              {r.overridden && <span className="ml-1"><Pill tone="indigo">Override</Pill></span>}
                            </div>
                          )}
                          <div className="mt-1.5">
                            <Link className="text-[11px] text-blue-700 hover:underline" href={`/admin/seance/preview?date=${d}&table=${l.table!.kind}`}>
                              Preview / Override ↗
                            </Link>
                          </div>
                        </td>
                      );
                    }
                    if (!MODES[l.mode]) {
                      return (
                        <td key={d} className={`px-3 py-3 text-xs ${d === today ? "bg-blue-50/30" : ""}`}>
                          {!r ? (
                            <Pill tone="slate">Not generated</Pill>
                          ) : r.sealed ? (
                            <Pill tone="red">Sealed</Pill>
                          ) : (
                            <span className="font-mono text-neutral-700">{r.answerId}</span>
                          )}
                          <div className="mt-1.5">
                            <Link className="text-[11px] text-blue-700 hover:underline" href="/admin/omens">Omens admin ↗</Link>
                          </div>
                        </td>
                      );
                    }
                    const options = MODES[l.mode]
                      .candidates(data, { dayIndex: dayIndex(d) })
                      .map((c) => ({ id: c.answerId, name: nameOf(l.mode, c.answerId) }))
                      .sort((a, b) => a.name.localeCompare(b.name));
                    return (
                      <td key={d} className={`px-3 py-3 ${d === today ? "bg-blue-50/30" : ""}`}>
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
      </Card>
    </div>
  );
}
