import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData } from "@/lib/engine/context";
import { LOCKS } from "@/locks.config";
import { poolRows } from "./pool";
import { Card, PageHeader, Pill } from "../kit";

export const dynamic = "force-dynamic";

const GROUPS = [["spirits", "The Spirits"], ["shop", "The Shop"], ["omens", "The Omens"], ["seance", "The Séance"]] as const;

export default async function PuzzlesAdmin() {
  await requireAdminPage();
  const today = todayDate();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const [data, rows] = await Promise.all([loadGameData(), db.dailyPuzzle.findMany({ where: { date: { in: days } }, select: { date: true, mode: true, sealed: true, sealedReason: true } })]);
  const by = new Map(rows.map((r) => [`${r.date}|${r.mode}`, r]));

  return (
    <div className="space-y-5">
      <PageHeader title="Puzzles" subtitle="Schedules, fixes, and answer pools for every lock. Shared hero, ability, and item settings live in the library." />
      {GROUPS.map(([g, title]) => (
        <Card key={g} title={title}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-4">Lock</th><th className="pr-4">Today</th><th className="pr-4">Next 7 days</th><th>Answer pool</th>
              </tr>
            </thead>
            <tbody>
              {LOCKS.filter((l) => l.group === g).map((l) => {
                const t = by.get(`${today}|${l.slug}`);
                const ahead = days.slice(1).filter((d) => { const r = by.get(`${d}|${l.slug}`); return r && !r.sealed; }).length;
                const pool = g === "omens" || !!l.box ? null : poolRows(l, data, today);
                return (
                  <tr key={l.slug} className="border-t border-neutral-200">
                    <td className="py-1.5 pr-4"><Link href={`/admin/puzzles/${l.slug}`} className="text-blue-700 hover:underline">{l.numeral}. {l.name}{l.table ? ` · ${l.table.label}` : ""}</Link></td>
                    <td className="pr-4">
                      {t && !t.sealed ? <Pill tone="green">ready</Pill> : t ? <Pill tone="red">sealed: {t.sealedReason}</Pill> : <Pill tone="amber">not generated</Pill>}
                    </td>
                    <td className={`pr-4 ${ahead < 7 ? "text-amber-700" : ""}`}>{ahead}/7 ready</td>
                    <td>
                      {!!l.box ? (
                        <Link href="/admin/seance" className="text-blue-700 hover:underline">Séance categories</Link>
                      ) : pool ? (
                        <>{pool.filter((r) => r.inPool).length} in pool{pool.some((r) => r.on && !r.inPool) ? <span className="text-amber-700"> · {pool.filter((r) => r.on && !r.inPool).length} missing data</span> : null}</>
                      ) : (
                        <Link href="/admin/omens" className="text-blue-700 hover:underline">scenarios</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
