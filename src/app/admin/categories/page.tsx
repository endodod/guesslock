import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { SEANCE_LOCKS } from "@/locks.config";
import { activeHeroes, categoryUsage, loadCategoryRows } from "@/lib/seance/library";
import { completeness, usableCategories } from "@/lib/seance/rules";
import { tableFeasible, tablePool } from "@/lib/seance/board";
import { CATEGORY_TYPES } from "@/lib/seance/types";
import { ActionButton } from "../ui";
import { clearFlag, createCategory, setStatus } from "./actions";

type Search = { type?: string; status?: string };

export default async function CategoriesAdmin({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  const { type, status } = await searchParams;
  const [heroes, rows, usage] = await Promise.all([activeHeroes(), loadCategoryRows(), categoryUsage()]);
  const ids = heroes.map((h) => h.id);
  const name = new Map(heroes.map((h) => [h.id, h.name]));
  const usable = usableCategories(rows, ids);
  const full = rows.map((c) => ({ ...c, ...completeness(c.memberships, ids) }));
  const shown = full.filter((c) => (!type || c.type === type) && (!status || c.status === status));
  const derivedDrafts = full.filter((c) => c.status === "draft" && c.source !== "curated");
  const flagged = full.filter((c) => c.flagged);

  const filterLink = (p: Search, label: string) => {
    const q = new URLSearchParams(Object.entries({ type, status, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    const active = (p.type !== undefined ? p.type === (type ?? "") : true) && (p.status !== undefined ? p.status === (status ?? "") : true);
    return <Link key={label} href={`/admin/categories${q ? `?${q}` : ""}`} className={active ? "font-semibold" : "text-blue-700 hover:underline"}>{label}</Link>;
  };

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-300 bg-white p-4">
        <h1 className="mb-1 text-lg font-semibold">The Séance: category library</h1>
        <p className="text-sm text-neutral-600">
          A category is a yes/no set over all {heroes.length} active heroes. Boards only use categories that are <strong>approved</strong> and
          <strong> complete</strong> (every active hero has a yes or no). Don&apos;t invent game facts: check every visual/lore membership against the
          portrait or lore before approving.
        </p>
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {SEANCE_LOCKS.map((l) => {
            const pool = tablePool(l.table!.kind, usable);
            const problem = tableFeasible(l.table!.kind, pool);
            return (
              <li key={l.slug} className={problem ? "text-red-700" : "text-green-800"}>
                {l.table!.label}: {pool.length} usable {problem ? `(sealed: ${problem})` : ""}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm">
          <Link className="text-blue-700 hover:underline" href="/admin/categories/preview">Board preview</Link> ·{" "}
          <Link className="text-blue-700 hover:underline" href="/admin/review#seance">Review queue</Link>
        </p>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">New curated category</h2>
        <form action={createCategory} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col">Type
            <select name="type" className="rounded border border-neutral-400 px-1 py-0.5">
              {CATEGORY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col">Label (shown when solved)
            <input name="label" required placeholder="e.g. Wears a hat" className="w-64 rounded border border-neutral-400 px-1 py-0.5" />
          </label>
          <label className="flex flex-col">Explanation (optional)
            <input name="explanation" placeholder="One short line for the results" className="w-80 rounded border border-neutral-400 px-1 py-0.5" />
          </label>
          <label className="flex flex-col">Difficulty
            <select name="difficulty" defaultValue="2" className="rounded border border-neutral-400 px-1 py-0.5">
              {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button className="rounded border border-neutral-400 bg-neutral-50 px-3 py-1 hover:bg-neutral-200">Create draft</button>
        </form>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">Derived-category review ({derivedDrafts.length} drafts, {flagged.length} changed by a sync)</h2>
        <ul className="space-y-2 text-sm">
          {flagged.map((c) => {
            const diff = c.diff as { added?: number[]; removed?: number[]; at?: string } | null;
            return (
              <li key={`f${c.id}`} className="rounded border border-amber-300 bg-amber-50 p-2">
                <Link className="font-medium text-blue-700 hover:underline" href={`/admin/categories/${c.id}`}>{c.label}</Link>{" "}
                <span className="text-xs text-neutral-600">({c.status}) {c.flagReason}</span>
                {diff && (
                  <div className="text-xs">
                    {diff.added?.length ? <span className="text-green-800">+ {diff.added.map((h) => name.get(h) ?? h).join(", ")} </span> : null}
                    {diff.removed?.length ? <span className="text-red-700">− {diff.removed.map((h) => name.get(h) ?? h).join(", ")}</span> : null}
                    {diff.at && <span className="text-neutral-500"> · {diff.at.slice(0, 10)}</span>}
                  </div>
                )}
                <div className="mt-1 flex gap-2"><ActionButton action={clearFlag.bind(null, c.id)} label="Looks right" /></div>
              </li>
            );
          })}
          {derivedDrafts.map((c) => (
            <li key={`d${c.id}`} className="rounded border border-neutral-200 p-2">
              <Link className="font-medium text-blue-700 hover:underline" href={`/admin/categories/${c.id}`}>{c.label}</Link>{" "}
              <span className="text-xs text-neutral-600">{c.members.length} members{c.unknown.length ? `, ${c.unknown.length} unknown` : ""} · difficulty {c.difficulty}</span>
              <div className="text-xs text-neutral-700">{c.members.map((h) => name.get(h)).join(", ")}</div>
              {c.unknown.length > 0 && <div className="text-xs text-amber-700">Unknown: {c.unknown.map((h) => name.get(h)).join(", ")}</div>}
              <div className="mt-1 flex gap-2">
                <ActionButton action={setStatus.bind(null, c.id, "approved")} label="Approve" />
                <ActionButton action={setStatus.bind(null, c.id, "retired")} label="Reject" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span className="text-neutral-500">Type:</span>
          {filterLink({ type: "" }, "all")}
          {CATEGORY_TYPES.map((t) => filterLink({ type: t }, t))}
          <span className="ml-4 text-neutral-500">Status:</span>
          {filterLink({ status: "" }, "all")}
          {["draft", "approved", "retired"].map((s) => filterLink({ status: s }, s))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500"><th>Label</th><th>Type</th><th>Source</th><th>Status</th><th>Diff.</th><th>Members</th><th>Complete</th><th>Last used</th></tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const used = usage.get(c.id);
              return (
                <tr key={c.id} className="border-t border-neutral-200">
                  <td><Link className="text-blue-700 hover:underline" href={`/admin/categories/${c.id}`}>{c.label}</Link></td>
                  <td>{c.type}</td>
                  <td>{c.source}</td>
                  <td className={c.status === "approved" ? "text-green-800" : c.status === "retired" ? "text-neutral-400" : "text-amber-700"}>{c.status}</td>
                  <td>{c.difficulty}</td>
                  <td>{c.members.length}</td>
                  <td className={c.complete ? "text-green-800" : "text-red-700"}>{c.complete ? "yes" : `${c.unknown.length} unknown`}</td>
                  <td className="text-xs">{used ? `${used.date} (${used.table})` : "never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="text-sm text-neutral-500">No categories match.</p>}
      </section>
    </div>
  );
}
