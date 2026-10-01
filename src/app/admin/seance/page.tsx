import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { SEANCE_BOX_LIST, SEANCE_BOXES, SEANCE_LOCKS, type SeanceEntity } from "@/locks.config";
import { activeEntities, categoryUsage, loadCategoryRows } from "@/lib/seance/library";
import { completeness, usableCategories } from "@/lib/seance/rules";
import { tableFeasible, tablePool } from "@/lib/seance/board";
import { ENTITY_TYPES } from "@/lib/seance/types";
import { ActionButton } from "../ui";
import { clearFlag, createCategory, setStatus } from "./actions";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

type Search = { entity?: string; type?: string; status?: string };

const inputStyle = "rounded border border-neutral-300 bg-neutral-50/50 px-2.5 py-1.5 text-xs text-neutral-800 transition focus:border-blue-500 focus:bg-white focus:outline-none";

export default async function CategoriesAdmin({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const entity = (["hero", "item", "ability"].includes(sp.entity ?? "") ? sp.entity : "hero") as SeanceEntity;
  const { type, status } = sp;
  const box = SEANCE_BOX_LIST.find((b) => b.entity === entity)!;
  const [heroes, rows, usage] = await Promise.all([activeEntities(entity), loadCategoryRows({ entity }), categoryUsage()]);
  const ids = heroes.map((h) => h.id);
  const name = new Map(heroes.map((h) => [h.id, h.name]));
  const usable = usableCategories(rows, ids);
  const full = rows.map((c) => ({ ...c, ...completeness(c.memberships, ids) }));
  const shown = full.filter((c) => (!type || c.type === type) && (!status || c.status === status));
  const derivedDrafts = full.filter((c) => c.status === "draft" && c.source !== "curated");
  const flagged = full.filter((c) => c.flagged);

  const filterLink = (p: Search, label: string) => {
    const q = new URLSearchParams(Object.entries({ entity, type, status, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    const active = (p.type !== undefined ? p.type === (type ?? "") : true) && (p.status !== undefined ? p.status === (status ?? "") : true);
    return (
      <Link
        key={label}
        href={`/admin/seance${q ? `?${q}` : ""}`}
        className={`rounded px-2.5 py-1 text-xs capitalize transition ${
          active ? "bg-neutral-900 font-medium text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Séance, Bazaar and Grimoire — Category Library"
        subtitle="Manage the groups the 16-tile boards are built from. Only complete, approved categories are used in daily puzzle generation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/seance/preview" className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50">
              Board Preview ↗
            </Link>
            <Link href="/admin/review#seance" className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50">
              Review Queue ↗
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-neutral-500">Library:</span>
        {SEANCE_BOX_LIST.map((b) => (
          <Link key={b.id} href={`/admin/seance?entity=${b.entity}`} className={`rounded px-2.5 py-1 text-xs ${b.entity === entity ? "bg-neutral-900 font-medium text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"}`}>
            {b.name} ({b.noun})
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Usable Categories" value={usable.length} tone="green" sub="Approved & complete" />
        <Stat label={`Active ${box.noun}`} value={heroes.length} sub="Every one needs a yes or no" />
        <Stat label="Flagged by Sync" value={flagged.length} tone={flagged.length > 0 ? "amber" : "green"} sub="Require review" />
        <Stat label="Pending Drafts" value={derivedDrafts.length} tone={derivedDrafts.length > 0 ? "amber" : "slate"} sub="Derived from API" />
      </div>

      {/* Table Pools */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SEANCE_LOCKS.filter((l) => SEANCE_BOXES[l.box!].entity === entity).map((l) => {
          const pool = tablePool(l.table!.kind, usable, entity);
          const problem = tableFeasible(l.table!.kind, pool);
          return (
            <div key={l.slug} className="rounded border border-neutral-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900">{l.table!.label} Table</span>
                <Pill tone={problem ? "red" : "green"}>{problem ? "Sealed" : "Playable"}</Pill>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-800">{pool.length}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {problem ? <span className="text-red-600">{problem}</span> : "Usable categories"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Create Category Form */}
      <Card title="New Curated Category" hint="Create a new draft group to categorize all active heroes">
        <form action={createCategory} className="flex flex-wrap items-end gap-3 text-xs">
          <input type="hidden" name="entity" value={entity} />
          <label className="block">
            <span className="font-medium text-neutral-700">Type</span>
            <select name="type" className={`${inputStyle} mt-1 block`}>
              {ENTITY_TYPES[entity].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block w-64">
            <span className="font-medium text-neutral-700">Category Label (Shown when solved)</span>
            <input name="label" required placeholder="e.g. Wears a hat" className={`${inputStyle} mt-1 block w-full`} />
          </label>
          <label className="min-w-64 flex-1">
            <span className="font-medium text-neutral-700">Player Explanation (Optional)</span>
            <input name="explanation" placeholder="Short description displayed on reveal" className={`${inputStyle} mt-1 block w-full`} />
          </label>
          <label className="block">
            <span className="font-medium text-neutral-700">Difficulty (1–4)</span>
            <select name="difficulty" defaultValue="2" className={`${inputStyle} mt-1 block font-mono`}>
              {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded bg-neutral-900 px-3.5 py-1.5 font-medium text-white shadow-sm transition hover:bg-neutral-800">
            Create Draft
          </button>
        </form>
      </Card>

      {/* Derived Category Reviews if any */}
      {(derivedDrafts.length > 0 || flagged.length > 0) && (
        <Card title="Categories Awaiting Review" hint={`${derivedDrafts.length} drafts · ${flagged.length} sync-changed`}>
          <div className="space-y-3">
            {flagged.map((c) => {
              const diff = c.diff as { added?: number[]; removed?: number[]; at?: string } | null;
              return (
                <div key={`f${c.id}`} className="rounded border border-amber-200 bg-amber-50/60 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <Link className="font-semibold text-blue-700 hover:underline" href={`/admin/seance/${c.id}`}>{c.label}</Link>
                    <Pill tone="amber">{c.flagReason ?? "Flagged"}</Pill>
                  </div>
                  {diff && (
                    <div className="mt-1.5 font-mono text-[11px]">
                      {diff.added?.length ? <span className="text-green-700">+ {diff.added.map((h) => name.get(h) ?? h).join(", ")} </span> : null}
                      {diff.removed?.length ? <span className="text-red-700">− {diff.removed.map((h) => name.get(h) ?? h).join(", ")}</span> : null}
                    </div>
                  )}
                  <div className="mt-2">
                    <ActionButton action={clearFlag.bind(null, c.id)} label="Looks correct" />
                  </div>
                </div>
              );
            })}
            {derivedDrafts.map((c) => (
              <div key={`d${c.id}`} className="rounded border border-neutral-200 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <Link className="font-semibold text-blue-700 hover:underline" href={`/admin/seance/${c.id}`}>{c.label}</Link>
                  <Pill tone="slate">Draft</Pill>
                </div>
                <p className="mt-1 text-neutral-600">
                  {c.members.length} members · Difficulty {c.difficulty} {c.unknown.length > 0 ? `· ${c.unknown.length} heroes unclassified` : ""}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <ActionButton action={setStatus.bind(null, c.id, "approved")} label="Approve" />
                  <ActionButton action={setStatus.bind(null, c.id, "retired")} label="Reject" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Table */}
      <Card title="Category Directory">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Type:</span>
            {filterLink({ type: "" }, "All Types")}
            {ENTITY_TYPES[entity].map((t) => filterLink({ type: t }, t))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Status:</span>
            {filterLink({ status: "" }, "All Status")}
            {["approved", "draft", "retired"].map((s) => filterLink({ status: s }, s))}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50/90 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-2.5 pl-3 pr-3">Category Label</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-center">Diff.</th>
                <th className="px-3 py-2.5 text-center">Members</th>
                <th className="px-3 py-2.5">Complete</th>
                <th className="py-2.5 pl-3 pr-3 text-right">Last Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map((c) => {
                const used = usage.get(c.id);
                return (
                  <tr key={c.id} className="transition hover:bg-neutral-50/80">
                    <td className="py-2.5 pl-3 pr-3 font-medium">
                      <Link className="text-neutral-900 hover:text-blue-600 hover:underline" href={`/admin/seance/${c.id}`}>
                        {c.label}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-600">{c.type}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-400 capitalize">{c.source}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      <Pill tone={c.status === "approved" ? "green" : c.status === "retired" ? "slate" : "amber"}>
                        {c.status}
                      </Pill>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs">{c.difficulty}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs font-medium text-neutral-700">{c.members.length}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {c.complete ? (
                        <span className="font-semibold text-green-700">✓ Complete</span>
                      ) : (
                        <span className="text-red-600">{c.unknown.length} unknown</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-3 pr-3 text-right font-mono text-xs text-neutral-500">
                      {used ? `${used.date} (${used.table})` : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-500">
              No categories match the selected filters.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
