import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData } from "@/lib/engine/context";
import { LOCKS } from "@/locks.config";
import { poolRows } from "./pool";
import { Card, PageHeader, Pill } from "../kit";
import { ActionButton } from "../ui";
import { clearFuture, rebuildFuture } from "./actions";
import { REBUILDABLE } from "@/lib/admin/future";

export const dynamic = "force-dynamic";
// Rebuilding a day runs the generator inside the action.
export const maxDuration = 300;

const GROUPS = [["spirits", "The Spirits"], ["shop", "The Shop"], ["omens", "The Omens"], ["seance", "The Séance"]] as const;

export default async function PuzzlesAdmin() {
  await requireAdminPage();
  const today = todayDate();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const [data, rows] = await Promise.all([loadGameData(), db.dailyPuzzle.findMany({ where: { date: { in: days } }, select: { date: true, mode: true, sealed: true, sealedReason: true, overridden: true } })]);
  const by = new Map(rows.map((r) => [`${r.date}|${r.mode}`, r]));

  return (
    <div className="space-y-5">
      <PageHeader title="Puzzles" subtitle="Schedules, fixes, and answer pools for every lock. Shared hero, ability, and item settings live in the library." />
      <Card
        title="Future days"
        hint="Puzzles freeze their data when they are built. After fixing data, clear or rebuild the days ahead. Today stays as it is (it is live). The Omens are rebuilt in their own page."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500"><th className="pr-4">Day</th><th className="pr-4">Built</th><th className="pr-4">Overrides</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {days.slice(1).map((d) => {
              const built = rows.filter((r) => r.date === d && !r.sealed && REBUILDABLE.includes(r.mode));
              return (
                <tr key={d} className="border-t border-neutral-200">
                  <td className="py-1.5 pr-4 font-mono">{d}</td>
                  <td className="pr-4">{built.length}/{REBUILDABLE.length}</td>
                  <td className="pr-4">{built.filter((r) => r.overridden).length || "–"}</td>
                  <td className="flex flex-wrap gap-2 py-1">
                    <ActionButton label="Clear" confirm={`Delete every generated puzzle of ${d} (Omens excepted, admin overrides included)?`} action={clearFuture.bind(null, d, undefined)} />
                    <ActionButton label="Rebuild now" confirm={`Build every puzzle of ${d} again from the current data? Admin overrides stay.`} action={rebuildFuture.bind(null, d, undefined)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <ActionButton
            label="Clear all future days"
            confirm="Delete every generated puzzle from tomorrow on (Omens excepted, admin overrides included)? The daily job rebuilds them; use Rebuild now per day to do it immediately."
            action={clearFuture.bind(null, undefined, undefined)}
          />
        </div>
      </Card>
      {GROUPS.map(([g, title]) => (
        <Card key={g} title={title}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-4">Lock</th><th className="pr-4">Today</th><th className="pr-4">Next 7 days</th><th className="pr-4">Answer pool</th><th>Future days</th>
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
                    <td className="py-1">
                      {REBUILDABLE.includes(l.slug) && (
                        <span className="flex flex-wrap gap-1">
                          <ActionButton label="Clear" confirm={`Delete ${l.name}'s puzzles from tomorrow on?`} action={clearFuture.bind(null, undefined, l.slug)} />
                          <ActionButton label="Rebuild" confirm={`Build ${l.name}'s puzzles from tomorrow on again from the current data?`} action={rebuildFuture.bind(null, undefined, l.slug)} />
                        </span>
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
