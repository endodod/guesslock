import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { apiValue, cellSource, type Entity } from "@/lib/admin/categories";
import { db } from "@/lib/db";
import { loadGameData } from "@/lib/engine/context";
import { activeColumns, COMPARE_TYPES, HERO_COLUMNS, ITEM_COLUMNS, type Attrs, type ColumnDef } from "@/lib/engine/columns";
import { ActionButton } from "../ui";
import { addCategory, deleteCategory, rebuildDataPuzzles, saveCategory, saveValues } from "./actions";
import { ValuesGrid, type GridRow } from "./ValuesGrid";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";
// "Rebuild future puzzles" runs the generator inside the action.
export const maxDuration = 300;

const TYPE_HELP: Record<string, string> = {
  exact: "Exact match (green on equality)",
  multi: "Multi-value (partial overlap shows orange)",
  numeric: "Numeric value (directional arrows)",
  date: "Calendar date (directional arrows)",
};

const inputStyle = "rounded border border-neutral-300 bg-neutral-50/50 px-2.5 py-1 text-xs text-neutral-800 transition focus:border-blue-500 focus:bg-white focus:outline-none";

export default async function Categories({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requireAdminPage();
  const entity: Entity = (await searchParams).entity === "item" ? "item" : "hero";
  const [data, rows] = await Promise.all([loadGameData(), db.category.findMany({ where: { entity } })]);
  const isHero = entity === "hero";
  const cols = (isHero ? data.heroColumns : data.itemColumns) as ColumnDef<{ attrs: Attrs }>[];
  const all = (isHero ? data.heroes : data.items) as unknown as ({ id: number; name: string; attrs: Attrs; exclude: string[]; icon?: string | null; image?: string | null; src: { slot?: string; tier?: number } })[];
  const mode = isHero ? "classic" : "item-classic";
  const pool = all.filter((r) => !r.exclude.includes(mode));
  const live = new Set(activeColumns(cols, pool, data).map((c) => c.key));
  const builtinKeys = new Set((isHero ? HERO_COLUMNS : ITEM_COLUMNS).map((c) => c.key));
  const rowOf = new Map(rows.map((r) => [r.key.slice(entity.length + 1), r]));

  const gridRows: GridRow[] = all.map((r) => ({
    id: r.id, name: r.name, icon: (isHero ? r.icon : r.image) ?? null,
    sub: isHero ? undefined : `${r.src.slot} T${r.src.tier}`,
    href: isHero ? `/admin/heroes/${r.id}` : undefined,
    cells: Object.fromEntries(cols.map((c) => {
      const v = c.get(r, data);
      const api = apiValue(entity, c, r, data);
      return [c.key, { value: v === null ? "" : String(v), source: cellSource(entity, c, r, v), api: api === null ? undefined : String(api) }];
    })),
  }));

  const liveCount = cols.filter((c) => !c.disabled && live.has(c.key)).length;
  const waitingCount = cols.filter((c) => !c.disabled && !live.has(c.key)).length;
  const customCount = cols.filter((c) => !builtinKeys.has(c.key)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attribute Categories"
        subtitle={`Configure comparison attributes for ${isHero ? "The Reckoning (Heroes)" : "The Appraisal (Items)"}. Custom columns appear once fully populated.`}
        actions={
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs font-medium">
            <Link
              href="/admin/categories?entity=hero"
              className={`rounded-md px-3 py-1.5 transition ${isHero ? "bg-white font-semibold text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Heroes · The Reckoning
            </Link>
            <Link
              href="/admin/categories?entity=item"
              className={`rounded-md px-3 py-1.5 transition ${!isHero ? "bg-white font-semibold text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Items · The Appraisal
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Columns" value={cols.length} sub={`${builtinKeys.size} built-in`} />
        <Stat label="Live in Puzzles" value={liveCount} tone="green" sub="Active and fully populated" />
        <Stat label="Waiting on Data" value={waitingCount} tone={waitingCount > 0 ? "amber" : "slate"} sub="Missing some values" />
        <Stat label="Custom Columns" value={customCount} sub="Curated in admin" />
      </div>

      <Card title="Column Definitions" hint="Reorder, rename, or toggle attributes. Built-in columns sync from upstream data.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50/90 text-xs font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur">
              <tr>
                <th className="w-12 py-3 pl-3 pr-2 text-center">On</th>
                <th className="w-20 px-2 py-3">Order</th>
                <th className="w-44 px-2 py-3">Column Name</th>
                <th className="px-2 py-3">Player Explanation</th>
                <th className="w-28 px-2 py-3">Type</th>
                <th className="w-20 px-2 py-3">Unit</th>
                <th className="w-36 px-2 py-3">Status</th>
                <th className="w-28 py-3 pl-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {cols.map((c, i) => {
                const builtin = builtinKeys.has(c.key);
                const filled = pool.filter((r) => c.get(r, data) !== null).length;
                const formId = `cat-${c.key}`;

                return (
                  <tr key={c.key} className="transition hover:bg-neutral-50/80">
                    <td className="py-2 pl-3 pr-2 text-center">
                      <input form={formId} type="checkbox" name="enabled" defaultChecked={!c.disabled} className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input form={formId} name="order" type="number" defaultValue={rowOf.get(c.key)?.order ?? i * 10} className={`${inputStyle} w-16 font-mono`} />
                    </td>
                    <td className="px-2 py-2">
                      <input form={formId} name="label" defaultValue={c.label} className={`${inputStyle} w-full font-medium`} />
                    </td>
                    <td className="px-2 py-2">
                      <input form={formId} name="info" defaultValue={c.info} className={`${inputStyle} w-full min-w-56`} />
                    </td>
                    <td className="px-2 py-2">
                      {builtin ? (
                        <span className="font-mono text-xs text-neutral-500">{c.type}</span>
                      ) : (
                        <select form={formId} name="type" defaultValue={c.type} className={inputStyle}>
                          {COMPARE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {builtin ? (
                        <span className="font-mono text-xs text-neutral-400">{c.unit || "—"}</span>
                      ) : (
                        <input form={formId} name="unit" defaultValue={c.unit ?? ""} placeholder="cm, etc." className={`${inputStyle} w-16 font-mono`} />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {c.disabled ? (
                        <Pill tone="slate">Disabled</Pill>
                      ) : live.has(c.key) ? (
                        <Pill tone="green">In Puzzles</Pill>
                      ) : (
                        <Pill tone="amber">{filled}/{pool.length} filled</Pill>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <form id={formId} action={saveCategory.bind(null, entity, c.key)} className="inline">
                          <button type="submit" className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50">
                            Save
                          </button>
                        </form>
                        <Link href={`/admin/categories/${encodeURIComponent(c.key)}?entity=${entity}`} className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-neutral-50">
                          Values
                        </Link>
                        {!builtin && (
                          <ActionButton action={deleteCategory.bind(null, entity, c.key)} label="Delete" confirm={`Delete "${c.label}" and all its values?`} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 border-t border-neutral-100 pt-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Create Custom Column</p>
          <form action={addCategory.bind(null, entity)} className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block text-xs font-medium text-neutral-700">
              Column Label
              <input name="label" required placeholder={isHero ? "e.g. Faction" : "e.g. Range"} className={`${inputStyle} mt-1 block w-44`} />
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Comparison Type
              <select name="type" className={`${inputStyle} mt-1 block`}>
                {COMPARE_TYPES.map((t) => <option key={t} value={t}>{TYPE_HELP[t]}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Unit
              <input name="unit" placeholder="m/s, etc." className={`${inputStyle} mt-1 block w-20 font-mono`} />
            </label>
            <label className="min-w-64 flex-1 text-xs font-medium text-neutral-700">
              Player Explanation
              <input name="info" placeholder="Tooltip text displayed on the guess grid header" className={`${inputStyle} mt-1 block w-full`} />
            </label>
            <button type="submit" className="rounded bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-800">
              Add Column
            </button>
          </form>
        </div>
      </Card>

      <Card id="values" title={`Attribute Values (${all.length} ${isHero ? "heroes" : "items"})`} hint="Filter by any category, edit any cell, then rebuild the future puzzles that use these values.">
        <ValuesGrid
          entity={entity}
          cols={cols.map((c) => ({ key: c.key, label: c.label, type: c.type, unit: c.unit, disabled: c.disabled, custom: c.custom }))}
          rows={gridRows}
          save={saveValues.bind(null, entity)}
          rebuild={rebuildDataPuzzles.bind(null, entity)}
        />
      </Card>
    </div>
  );
}
