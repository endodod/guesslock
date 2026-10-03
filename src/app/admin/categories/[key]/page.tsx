import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/auth";
import { apiValue, cellSource, type Entity } from "@/lib/admin/categories";
import { loadGameData } from "@/lib/engine/context";
import { activeColumns, type Attrs, type ColumnDef } from "@/lib/engine/columns";
import { rebuildDataPuzzles, saveValues } from "../actions";
import { Card, PageHeader, Pill } from "../../kit";
import { ColumnEditor, type ColumnRow } from "./ColumnEditor";

export const dynamic = "force-dynamic";
// "Rebuild future puzzles" runs the generator inside the action.
export const maxDuration = 300;

const TYPE_HELP: Record<string, string> = {
  exact: "One value; equal values match.",
  multi: "Several values, comma-separated; one shared value shows orange.",
  numeric: "A number (or none); arrows point toward the answer.",
  date: "A date as YYYY-MM-DD; arrows point toward the answer.",
};

type Row = { id: number; name: string; attrs: Attrs; exclude: string[]; icon?: string | null; image?: string | null; src: { slot?: string; tier?: number } };

export default async function CategoryValues({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ entity?: string }> }) {
  await requireAdminPage();
  const { key } = await params;
  const entity: Entity = (await searchParams).entity === "item" ? "item" : "hero";
  const isHero = entity === "hero";
  const data = await loadGameData();
  const cols = (isHero ? data.heroColumns : data.itemColumns) as ColumnDef<{ attrs: Attrs }>[];
  const col = cols.find((c) => c.key === decodeURIComponent(key));
  if (!col) notFound();

  const all = (isHero ? data.heroes : data.items) as unknown as Row[];
  const pool = all.filter((r) => !r.exclude.includes(isHero ? "classic" : "item-classic"));
  const live = activeColumns(cols, pool, data).some((c) => c.key === col.key);
  const rows: ColumnRow[] = all.map((r) => {
    const v = col.get(r, data);
    const api = apiValue(entity, col, r, data);
    return {
      id: r.id, name: r.name, icon: (isHero ? r.icon : r.image) ?? null,
      sub: isHero ? undefined : `${r.src.slot} T${r.src.tier}`,
      href: isHero ? `/admin/heroes/${r.id}#attributes` : undefined,
      value: v === null ? "" : String(v), source: cellSource(entity, col, r, v), api: api === null ? undefined : String(api),
    };
  });
  const filled = pool.filter((r) => col.get(r, data) !== null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${col.label}${col.unit ? ` (${col.unit})` : ""}`}
        subtitle={<>{col.info} <span className="text-neutral-400">· {TYPE_HELP[col.type] ?? col.type}</span></>}
        actions={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            {col.disabled ? <Pill tone="slate">Switched off</Pill> : live ? <Pill tone="green">In puzzles</Pill> : <Pill tone="amber">{filled}/{pool.length} filled</Pill>}
            <Link href={`/admin/categories?entity=${entity}`} className="text-blue-700 hover:underline">All categories</Link>
          </span>
        }
      />
      <Card>
        <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Categories">
          {cols.map((c) => (
            <Link
              key={c.key} href={`/admin/categories/${encodeURIComponent(c.key)}?entity=${entity}`} aria-current={c.key === col.key ? "page" : undefined}
              className={`rounded-full px-2.5 py-0.5 ring-1 ${c.key === col.key ? "bg-neutral-900 text-white ring-neutral-900" : "ring-neutral-300 hover:bg-neutral-100"} ${c.disabled ? "line-through opacity-60" : ""}`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </Card>
      <Card
        title={`${col.label} for every ${isHero ? "hero" : "item"}`}
        hint={col.custom || col.curated ? "Curated: the category joins the puzzles once every row has a value. Empty removes a value." : "From the API: a value here overrides it; empty goes back to the API."}
      >
        <ColumnEditor
          key={col.key} entity={entity} colKey={col.key} type={col.type} rows={rows}
          save={saveValues.bind(null, entity)} rebuild={rebuildDataPuzzles.bind(null, entity)}
        />
      </Card>
    </div>
  );
}
