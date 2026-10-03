import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormHero } from "@/lib/deadlock/types";
import { mediaUrl } from "@/lib/media";
import { loadGameData } from "@/lib/engine/context";
import { formatCell, type Attrs, type ColumnDef } from "@/lib/engine/columns";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

export default async function HeroesAdmin({ searchParams }: { searchParams: Promise<{ q?: string; col?: string; val?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [all, lines, data] = await Promise.all([
    db.hero.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.voiceLine.groupBy({ by: ["heroId"], where: { status: "approved" }, _count: true }),
    loadGameData(),
  ]);
  // Current category values (what puzzles use), for the table and the filter.
  const cols = data.heroColumns as ColumnDef<{ attrs: Attrs }>[];
  const cell = (id: number, key: string) => {
    const row = data.hero(id), col = cols.find((c) => c.key === key);
    if (!row || !col) return null;
    const v = col.get(row, data);
    return v === null ? null : formatCell(col, v);
  };
  const q = (sp.q ?? "").trim().toLowerCase();
  const val = (sp.val ?? "").trim().toLowerCase();
  const heroes = all.filter((h) => {
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (!sp.col) return true;
    const v = cell(h.id, sp.col);
    if (!val) return v === null; // no value given: heroes missing this category
    return !!v && (v.toLowerCase() === val || v.toLowerCase().split(/[,/]/).map((x) => x.trim()).includes(val) || v.toLowerCase().includes(val));
  });
  const shownCols = ["gender", "archetype", "species", "weapon", "release", "role"].map((k) => cols.find((c) => c.key === k)).filter((c): c is ColumnDef<{ attrs: Attrs }> => !!c);
  const approved = new Map(lines.map((l) => [l.heroId, l._count]));

  const activeCount = all.filter((h) => h.active).length;
  const flaggedCount = all.filter((h) => h.needsReview).length;
  const missingDataCount = all.filter((h) => h.active && cols.some((c) => !c.disabled && cell(h.id, c.key) === null)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Heroes"
        subtitle="Catalog roster, lore attributes, emojis, voice lines, and per-mode exclusions."
        actions={
          <span className="flex items-center gap-3 text-xs text-neutral-400">
            {activeCount} active · {all.length - activeCount} archived
            <Link href="/admin/categories?entity=hero#values" className="rounded border border-neutral-300 px-2.5 py-1 text-sm text-blue-700 hover:bg-neutral-50">Edit every value (data grid)</Link>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Heroes" value={all.length} sub={`${activeCount} active in game`} />
        <Stat label="Flagged for Review" value={flaggedCount} tone={flaggedCount > 0 ? "amber" : "green"} sub="Sync changes" />
        <Stat label="Missing Attributes" value={missingDataCount} tone={missingDataCount > 0 ? "red" : "green"} sub="Reckoning data" />
        <Stat label="Total Voice Lines" value={[...approved.values()].reduce((a, b) => a + b, 0)} tone="green" sub="Approved voice lines" />
      </div>

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs text-neutral-600">Name<input name="q" defaultValue={sp.q ?? ""} className="mt-1 block rounded border border-neutral-300 px-2 py-1" /></label>
          <label className="text-xs text-neutral-600">Category
            <select name="col" defaultValue={sp.col ?? ""} className="mt-1 block rounded border border-neutral-300 px-2 py-1">
              <option value="">any</option>
              {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600">Value <span className="text-neutral-400">(empty = missing)</span><input name="val" defaultValue={sp.val ?? ""} className="mt-1 block rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Filter</button>
          {(sp.q || sp.col) && <Link href="/admin/heroes" className="text-xs text-blue-700 hover:underline">Clear</Link>}
          <span className="ml-auto text-xs text-neutral-500">{heroes.length} shown</span>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50/90 text-xs font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur">
              <tr>
                <th className="py-3 pl-3 pr-4">Hero</th>
                {shownCols.map((c) => (
                  <th key={c.key} className="px-3 py-3">
                    <Link href={`/admin/categories/${encodeURIComponent(c.key)}?entity=hero`} title={`Edit ${c.label} for every hero`} className="hover:text-blue-700 hover:underline">{c.label}</Link>
                  </th>
                ))}
                <th className="px-3 py-3">Emojis</th>
                <th className="px-3 py-3 text-center">Lines</th>
                <th className="px-3 py-3">Excluded Modes</th>
                <th className="py-3 pl-3 pr-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {heroes.map((h) => {
                const src = h.source as unknown as NormHero;
                const img = mediaUrl(src?.images?.small) ?? mediaUrl(src?.images?.card);
                const isComplete = h.species && h.releaseDate && h.emojis.length >= 10 && h.emojisReviewed;

                return (
                  <tr key={h.id} className={`transition hover:bg-neutral-50/80 ${h.active ? "" : "opacity-40"}`}>
                    <td className="py-2.5 pl-3 pr-4">
                      <div className="flex items-center gap-3">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className="h-9 w-9 shrink-0 rounded-full border border-neutral-200 bg-neutral-900 object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 font-mono text-xs text-neutral-500">
                            {h.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link className="font-semibold text-neutral-900 hover:text-blue-600 hover:underline" href={`/admin/heroes/${h.id}`}>
                            {h.name}
                          </Link>
                          <div className="text-xs text-neutral-400">
                            {src?.heroType ? <span className="capitalize">{src.heroType}</span> : "Hero"}
                            {h.aliases.length > 0 && <span className="ml-1 text-neutral-500">({h.aliases.join(", ")})</span>}
                            {!h.active && <span className="ml-1.5 font-medium text-red-600">[Inactive]</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {shownCols.map((c) => {
                      const v = cell(h.id, c.key);
                      return (
                        <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-700">
                          {v ?? (h.active ? <Pill tone="red">Missing</Pill> : <span className="text-neutral-400">—</span>)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-xs">
                      <span className="text-base tracking-widest">{h.emojis.slice(0, 5).join("")}</span>
                      {h.emojis.length < 10 && (
                        <span className="ml-1">
                          <Pill tone="amber">{h.emojis.length}/10</Pill>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs">
                      <span className={(approved.get(h.id) ?? 0) < 5 ? "font-semibold text-amber-600" : "text-neutral-700"}>
                        {approved.get(h.id) ?? 0}
                      </span>
                      {h.genericVoice && <span className="ml-1 text-[10px] text-neutral-400">(generic)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {h.excludeFromModes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {h.excludeFromModes.map((m) => (
                            <span key={m} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right text-xs">
                      {h.needsReview ? (
                        <Pill tone="amber">{h.reviewReasons[0] ?? "Review"}</Pill>
                      ) : isComplete ? (
                        <Pill tone="green">Ready</Pill>
                      ) : (
                        <Pill tone="slate">Draft</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
