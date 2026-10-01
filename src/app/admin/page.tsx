import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate } from "@/lib/day";
import { dayMeta } from "@/lib/server/puzzles";
import { fillSealedToday, relockToday, runGenerate, runSync, runVoiceImportAll } from "./actions";
import { ActionButton, RelockButton } from "./ui";
import { Card, PageHeader, Pill, Stat } from "./kit";

type Diff = { added: string[]; removed: string[]; changed: { name: string; fields: string[] }[] };

function ago(d?: Date | null): string {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

export default async function AdminStatus() {
  await requireAdminPage();
  const today = todayDate();
  const [runs, meta, counts] = await Promise.all([
    db.syncRun.findMany({ orderBy: { id: "desc" }, take: 12 }),
    dayMeta(today),
    Promise.all([
      db.hero.count({ where: { needsReview: true } }),
      db.item.count({ where: { needsReview: true } }),
      db.ability.count({ where: { needsReview: true } }),
      db.textEntry.count({ where: { OR: [{ status: "auto" }, { stale: true }] } }),
    ]),
  ]);
  const lastAssets = runs.find((r) => r.kind === "assets" && r.status === "ok");
  const diff = lastAssets?.diff as Diff | undefined;
  const open = meta.filter((m) => m.state === "available").length;
  const sealed = meta.filter((m) => m.state === "sealed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const pending = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Status" subtitle={`Today is ${today}. Data from the Deadlock API, client build ${lastAssets?.clientVersion ?? "?"}.`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Locks open today" value={`${open} / ${LOCKS.length}`} tone={open === LOCKS.length ? "green" : "amber"} sub={`${LOCKS.length - open - sealed} not generated`} />
        <Stat label="Sealed today" value={sealed} tone={sealed ? "red" : "green"} sub={sealed ? "see the list below" : "nothing sealed"} />
        <Stat label="Last asset sync" value={ago(lastAssets?.finishedAt)} tone={lastAssets ? "green" : "red"} sub={lastAssets?.finishedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "no successful sync yet"} />
        <Stat label="To review" value={pending} tone={pending ? "amber" : "green"} sub={`${counts[0]} heroes · ${counts[1]} items · ${counts[2]} abilities · ${counts[3]} texts`} />
      </div>

      <Card title="Quick actions" hint="Long jobs run to completion; progress shows under Recent runs.">
        <div className="flex flex-wrap gap-2">
          <ActionButton action={runSync} label="Run asset sync" />
          <ActionButton action={runGenerate} label="Generate next 7 days" />
          <ActionButton action={fillSealedToday} label="Fill today's sealed locks" />
          <ActionButton action={runVoiceImportAll} label="Import voice lines (background)" />
          <RelockButton action={relockToday} today={today} />
        </div>
        {diff && (
          <div className="mt-5 grid gap-4 border-t border-neutral-200 pt-4 md:grid-cols-3">
            <DiffList title="Added" items={diff.added} tone="green" />
            <DiffList title="Removed" items={diff.removed} tone="red" />
            <DiffList title="Changed" items={diff.changed.map((c) => `${c.name}: ${c.fields.join(", ")}`)} tone="amber" />
          </div>
        )}
      </Card>

      <Card title={`Today's locks (${today})`} hint={failed ? `${failed} failed run(s) in the recent history` : undefined}>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {LOCKS.map((l) => {
            const m = meta.find((x) => x.slug === l.slug)!;
            const tone = m.state === "available" ? "green" : m.state === "sealed" ? "red" : "slate";
            return (
              <li key={l.slug}>
                <Link href={`/admin/puzzles/${l.slug}`} className="flex items-start gap-3 rounded-lg border border-neutral-200 px-3 py-2 no-underline transition hover:border-neutral-300 hover:bg-neutral-50">
                  <span className="mt-0.5 min-w-9 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-[0.7rem] font-semibold tracking-wide text-neutral-600">{l.numeral}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">{l.name}{l.table ? ` · ${l.table.label}` : ""}</span>
                    {m.sealedReason && <span className="block truncate text-xs text-neutral-500" title={m.sealedReason}>{m.sealedReason}</span>}
                  </span>
                  <Pill tone={tone}>{m.state === "available" ? "open" : m.state === "sealed" ? "sealed" : "none"}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Recent runs" hint="Includes changes made through the agent API.">
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>#</th><th>Kind</th><th>Status</th><th>Started</th><th>Finished</th><th>Counts</th><th>Error</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="text-neutral-500">{r.id}</td>
                  <td className="font-medium">{r.kind}</td>
                  <td><Pill tone={r.status === "ok" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Pill></td>
                  <td className="whitespace-nowrap text-neutral-600">{r.startedAt.toISOString().slice(5, 19).replace("T", " ")}</td>
                  <td className="whitespace-nowrap text-neutral-600">{r.finishedAt?.toISOString().slice(5, 19).replace("T", " ") ?? "…"}</td>
                  <td className="font-mono text-xs text-neutral-600">{r.counts ? JSON.stringify(r.counts) : ""}</td>
                  <td className="max-w-md truncate text-xs text-red-700" title={r.error ?? ""}>{r.error?.split("\n")[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" | "amber" }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{title} <Pill tone={tone}>{items.length}</Pill></h3>
      {items.length === 0 ? <p className="text-xs text-neutral-400">nothing</p> : (
        <ul className="max-h-44 space-y-0.5 overflow-auto text-xs text-neutral-600">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}
