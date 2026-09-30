import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { cellSource, type Entity } from "@/lib/admin/categories";
import { db } from "@/lib/db";
import { loadGameData } from "@/lib/engine/context";
import { activeColumns, COMPARE_TYPES, HERO_COLUMNS, ITEM_COLUMNS, type Attrs, type ColumnDef } from "@/lib/engine/columns";
import { ActionButton } from "../ui";
import { addCategory, deleteCategory, saveCategory, saveValues } from "./actions";
import { ValuesGrid, type GridRow } from "./ValuesGrid";

export const dynamic = "force-dynamic";

const TYPE_HELP: Record<string, string> = {
  exact: "Exact: green on a match",
  multi: "Multi: comma-separated, orange when some overlap",
  numeric: "Number: arrows toward the answer",
  date: "Date: arrows toward the answer",
};
const input = "rounded border border-neutral-400 px-2 py-1";

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
    cells: Object.fromEntries(cols.map((c) => {
      const v = c.get(r, data);
      return [c.key, { value: v === null ? "" : String(v), source: cellSource(entity, c, r, v) }];
    })),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <nav className="flex gap-2 text-sm">
          {(["hero", "item"] as const).map((e) => (
            <Link key={e} href={`/admin/categories?entity=${e}`} className={`rounded px-3 py-1 ${e === entity ? "bg-neutral-900 text-white" : "border border-neutral-400 bg-white"}`}>
              {e === "hero" ? "Heroes · The Reckoning" : "Items · The Appraisal"}
            </Link>
          ))}
        </nav>
      </div>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-1 font-semibold">Columns</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Built-in columns come from the API and can be renamed, reordered or switched off. Custom categories are filled in below and join
          the puzzle once every {isHero ? "hero" : "item"} in the pool has a value. Changes apply to newly generated puzzles.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="pr-2">On</th><th className="pr-2">Order</th><th className="pr-2">Name</th><th className="pr-2">Explanation (shown to players)</th>
              <th className="pr-2">Type</th><th className="pr-2">Unit</th><th className="pr-2">Status</th><th />
            </tr>
          </thead>
          <tbody>
            {cols.map((c, i) => {
              const builtin = builtinKeys.has(c.key);
              const filled = pool.filter((r) => c.get(r, data) !== null).length;
              const formId = `cat-${c.key}`;
              return (
                <tr key={c.key} className="border-t border-neutral-200 align-middle">
                  <td className="py-1.5 pr-2"><input form={formId} type="checkbox" name="enabled" defaultChecked={!c.disabled} /></td>
                  <td className="pr-2"><input form={formId} name="order" type="number" defaultValue={rowOf.get(c.key)?.order ?? i * 10} className={`${input} w-16`} /></td>
                  <td className="pr-2"><input form={formId} name="label" defaultValue={c.label} className={`${input} w-36`} /></td>
                  <td className="pr-2"><input form={formId} name="info" defaultValue={c.info} className={`${input} w-full min-w-64`} /></td>
                  <td className="pr-2">
                    {builtin ? <span className="text-xs text-neutral-600">{c.type} (API)</span> : (
                      <select form={formId} name="type" defaultValue={c.type} className={input}>
                        {COMPARE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="pr-2">{builtin ? null : <input form={formId} name="unit" defaultValue={c.unit ?? ""} className={`${input} w-16`} />}</td>
                  <td className="whitespace-nowrap pr-2 text-xs">
                    {c.disabled ? <span className="text-neutral-500">off</span>
                      : live.has(c.key) ? <span className="text-green-700">in puzzles</span>
                      : <span className="text-amber-700">waiting: {filled}/{pool.length} filled</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    <form id={formId} action={saveCategory.bind(null, entity, c.key)} className="inline">
                      <button className="rounded border border-neutral-400 px-2 py-0.5">Save</button>
                    </form>
                    {!builtin && <span className="ml-1"><ActionButton action={deleteCategory.bind(null, entity, c.key)} label="Delete" confirm={`Delete "${c.label}" and all its values?`} /></span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={addCategory.bind(null, entity)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3 text-sm">
          <strong className="mr-2 self-center">Add a category</strong>
          <label>Name<input name="label" required placeholder={isHero ? "e.g. Faction" : "e.g. Range"} className={`${input} block w-40`} /></label>
          <label>Type
            <select name="type" className={`${input} block`}>{COMPARE_TYPES.map((t) => <option key={t} value={t}>{TYPE_HELP[t]}</option>)}</select>
          </label>
          <label>Unit<input name="unit" placeholder="cm" className={`${input} block w-20`} /></label>
          <label className="min-w-64 flex-1">Explanation<input name="info" placeholder="Shown on the column header" className={`${input} block w-full`} /></label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Add</button>
        </form>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">Values ({all.length} {isHero ? "heroes" : "items"})</h2>
        <ValuesGrid
          entity={entity}
          cols={cols.map((c) => ({ key: c.key, label: c.label, type: c.type, unit: c.unit, disabled: c.disabled, custom: c.custom }))}
          rows={gridRows}
          save={saveValues.bind(null, entity)}
        />
      </section>
    </div>
  );
}
