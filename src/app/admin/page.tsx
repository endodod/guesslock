import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS } from "@/locks.config";
import { todayDate } from "@/lib/day";
import { dayMeta } from "@/lib/server/puzzles";
import { fillSealedToday, runGenerate, runSync, runVoiceImportAll } from "./actions";
import { ActionButton } from "./ui";

type Diff = { added: string[]; removed: string[]; changed: { name: string; fields: string[] }[] };

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

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-300 bg-white p-4">
        <h1 className="mb-2 text-lg font-semibold">Sync status</h1>
        <p>
          Last successful sync: <strong>{lastAssets?.finishedAt?.toISOString() ?? "never"}</strong> · data version (client build):{" "}
          <strong>{lastAssets?.clientVersion ?? "?"}</strong>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton action={runSync} label="Run asset sync now" />
          <ActionButton action={runGenerate} label="Generate next 7 days" />
          <ActionButton action={fillSealedToday} label="Fill today's sealed locks" />
          <ActionButton action={runVoiceImportAll} label="Import voice lines (all heroes, background)" />
        </div>
        {diff && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <DiffList title={`Added (${diff.added.length})`} items={diff.added} />
            <DiffList title={`Removed (${diff.removed.length})`} items={diff.removed} />
            <DiffList title={`Changed (${diff.changed.length})`} items={diff.changed.map((c) => `${c.name}: ${c.fields.join(", ")}`)} />
          </div>
        )}
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">Today ({today})</h2>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {LOCKS.map((l) => {
            const m = meta.find((x) => x.slug === l.slug)!;
            return (
              <li key={l.slug} className={m.state === "available" ? "text-green-800" : "text-red-700"}>
                <Link href={`/admin/puzzles/${l.slug}`} className="hover:underline">{l.numeral} {l.name}</Link>: {m.state}{m.sealedReason ? ` (${m.sealedReason})` : ""}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-neutral-600">
          Review queue: {counts[0]} heroes, {counts[1]} items, {counts[2]} abilities, {counts[3]} texts not yet reviewed (already live).
        </p>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">Recent runs</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th>#</th><th>Kind</th><th>Status</th><th>Started</th><th>Finished</th><th>Counts</th><th>Error</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200 align-top">
                <td>{r.id}</td>
                <td>{r.kind}</td>
                <td className={r.status === "ok" ? "text-green-700" : r.status === "failed" ? "text-red-700" : "text-amber-700"}>{r.status}</td>
                <td>{r.startedAt.toISOString().slice(0, 19)}</td>
                <td>{r.finishedAt?.toISOString().slice(0, 19) ?? "…"}</td>
                <td className="font-mono text-xs">{r.counts ? JSON.stringify(r.counts) : ""}</td>
                <td className="max-w-md truncate text-xs text-red-700" title={r.error ?? ""}>{r.error?.split("\n")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="max-h-48 overflow-auto text-xs">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
