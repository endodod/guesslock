import Link from "next/link";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireAdminPage } from "@/lib/admin/auth";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { OMEN_LOCKS } from "@/locks.config";
import { loadTuning, queriesLastHour } from "@/lib/omens/harvest";
import { ActionButton } from "../ui";
import { approveDay, harvestNow, regenerateDay, saveTuning, setScenarioStatus } from "./actions";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function OmensAdmin() {
  await requireAdminPage();
  const today = todayDate();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [byStatus, failed, recentQueries, dayRows, pool, tuning] = await Promise.all([
    db.omenMatch.groupBy({ by: ["status", "source"], _count: true }),
    db.omenMatch.findMany({ where: { status: { in: ["failed", "rejected"] } }, orderBy: { updatedAt: "desc" }, take: 12 }),
    queriesLastHour(),
    db.dailyPuzzle.findMany({ where: { date: { in: days }, mode: { in: OMEN_LOCKS.map((l) => l.slug) } } }),
    db.scenario.findMany({ where: { source: "daily", dailyDate: null, status: { in: ["candidate", "approved"] } }, orderBy: { quality: "desc" }, take: 60 }),
    loadTuning(),
  ]);
  const scenarioIds = dayRows.filter((r) => !r.sealed).map((r) => r.answerId);
  const scenarios = new Map((await db.scenario.findMany({ where: { id: { in: scenarioIds } } })).map((s) => [s.id, s]));
  const rows = new Map(dayRows.map((r) => [`${r.date}|${r.mode}`, r]));
  const ready = byStatus.filter((s) => s.status === "ready").reduce((a, s) => a + s._count, 0);
  const noReplay = byStatus.filter((s) => s.status === "rejected").reduce((a, s) => a + s._count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="The Omens" subtitle="Harvest replay scenarios, approve daily outcomes, and tune detection quality." actions={<ActionButton action={harvestNow} label="Harvest now (~50 s)" />} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Ready matches" value={ready} tone="green" sub="Available for daily picks" />
        <Stat label="Rejected" value={noReplay} tone={noReplay > 0 ? "amber" : "slate"} sub="No usable replay" />
        <Stat label="Queries / hour" value={`${recentQueries} / ${config.omenQueriesPerHour}`} sub={config.apiKey ? "API key set" : "No API key"} />
        <Stat label="Candidate pool" value={pool.length} sub="Daily scenarios shown" />
      </div>

      <Card title="Harvest queue" hint="Replay ingestion and recent failures">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <span>Replay queries in the last hour: <strong>{recentQueries}</strong> / {config.omenQueriesPerHour}{config.apiKey ? " (API key set)" : " (no API key: 20/h limit)"}</span>
          <span>Matches ready: <strong>{ready}</strong> · rejected/no replay: <strong>{noReplay}</strong></span>
        </div>
        <table className="text-sm">
          <thead><tr className="text-left text-neutral-500"><th className="pr-6">Status</th><th className="pr-6">Source</th><th>Matches</th></tr></thead>
          <tbody>
            {byStatus.map((s) => <tr key={`${s.status}-${s.source}`}><td className="pr-6"><Pill tone={s.status === "ready" ? "green" : s.status === "failed" ? "red" : "amber"}>{s.status}</Pill></td><td className="pr-6">{s.source}</td><td>{s._count}</td></tr>)}
          </tbody>
        </table>
        {failed.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-600">Recent failures and rejections ({failed.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {failed.map((m) => <li key={String(m.matchId)}><code>{String(m.matchId)}</code> {m.status}: {m.error}</li>)}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Next 7 days" hint="Approve or regenerate the scenario assigned to each Omen lock">
        <p className="mb-2 text-sm text-neutral-600">An unapproved day keeps the automatic pick. Regenerate rejects the current scenario and freezes the next best one.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th>Date</th>{OMEN_LOCKS.map((l) => <th key={l.slug}>{l.name}</th>)}</tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d} className="border-t border-neutral-200 align-top">
                <td className="py-2 pr-4 font-mono">{d}</td>
                {OMEN_LOCKS.map((l) => {
                  const row = rows.get(`${d}|${l.slug}`);
                  const s = row && !row.sealed ? scenarios.get(row.answerId) : undefined;
                  return (
                    <td key={l.slug} className="py-2 pr-4">
                      {s ? (
                        <div className="space-y-1">
                          <div>
                            <Link className="text-blue-700 hover:underline" href={`/admin/omens/${s.id}`}>{s.id}</Link>
                            <div className="text-xs text-neutral-600">
                              {s.positive ? "positive" : "negative"} · quality {s.quality.toFixed(2)} · rank {s.rank} · T {clock(s.t)}
                              {s.status === "approved" && <span className="ml-1"><Pill tone="green">approved</Pill></span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.status !== "approved" && <ActionButton action={approveDay.bind(null, d, l.slug)} label="Approve" />}
                            <ActionButton action={regenerateDay.bind(null, d, l.slug)} label="Regenerate" confirm="Reject this scenario and pick another?" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-neutral-500">{row?.sealed ? `sealed: ${row.sealedReason}` : "not generated"}</span>
                          <div><ActionButton action={regenerateDay.bind(null, d, l.slug)} label="Assign" /></div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Daily candidate pool (${pool.length} shown)`} hint="Approved candidates are used first, best quality first.">
        <p className="mb-2 text-sm text-neutral-600">Approved candidates are used first, best quality first.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th>Scenario</th><th>Omen</th><th>Outcome</th><th>Quality</th><th>Rank</th><th>Match day</th><th /></tr></thead>
          <tbody>
            {pool.map((s) => (
              <tr key={s.id} className="border-t border-neutral-200">
                <td className="py-1"><Link className="text-blue-700 hover:underline" href={`/admin/omens/${s.id}`}>{s.id}</Link></td>
                <td>{s.omen}</td><td><Pill tone={s.positive ? "green" : "slate"}>{s.positive ? "positive" : "negative"}</Pill></td><td>{s.quality.toFixed(2)}</td><td>{s.rank}</td><td>{s.patch}</td>
                <td className="space-x-1 whitespace-nowrap">
                  {s.status === "approved" ? <Pill tone="green">approved</Pill> : <ActionButton action={setScenarioStatus.bind(null, s.id, "approved")} label="Approve" />}
                  <ActionButton action={setScenarioStatus.bind(null, s.id, "rejected")} label="Reject" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Detection tuning" hint="Applies to scenarios built from now on. Ranges use min-max seconds.">
        <form action={saveTuning} className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(tuning).map(([k, v]) => (
            <label key={k} className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{k}</span>
              <input name={k} defaultValue={Array.isArray(v) ? v.join("-") : String(v)} className="w-28 rounded border border-neutral-300 px-2 py-1" />
            </label>
          ))}
          <div className="sm:col-span-2 lg:col-span-3">
            <button className="rounded border border-neutral-400 bg-neutral-50 px-3 py-1 hover:bg-neutral-200">Save tuning</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
