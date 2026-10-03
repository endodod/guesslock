"use client";
// Category values for every hero or item, editable in place. Only changed cells are sent on save.
// Rows can be filtered by name and by any number of column conditions (any category: gender, archetype, role, slot…);
// columns can be hidden. Hover a cell to see the API value it overrides.
import { useMemo, useState, useTransition } from "react";

export type GridCol = { key: string; label: string; type: string; unit?: string; disabled?: boolean; custom?: boolean };
export type GridCell = { value: string; source: "api" | "admin" | "missing"; api?: string };
export type GridRow = { id: number; name: string; icon: string | null; sub?: string; href?: string; cells: Record<string, GridCell> };

const HELP: Record<string, string> = {
  exact: "text", multi: "a, b", numeric: "number or none", date: "YYYY-MM-DD",
};

type Op = "contains" | "is" | "not" | "empty" | "set" | "admin" | "api" | "gt" | "lt";
const OPS: [Op, string][] = [
  ["contains", "contains"], ["is", "is exactly"], ["not", "is not"], ["gt", "greater than"], ["lt", "less than"],
  ["empty", "is missing"], ["set", "has a value"], ["admin", "is set by admin"], ["api", "comes from the API"],
];
const NEEDS_TEXT = new Set<Op>(["contains", "is", "not", "gt", "lt"]);
type Filter = { col: string; op: Op; text: string };

const parts = (v: string) => v.split(/[,/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

function matches(cell: GridCell | undefined, f: Filter): boolean {
  const v = (cell?.value ?? "").trim();
  const t = f.text.trim().toLowerCase();
  switch (f.op) {
    case "empty": return !v;
    case "set": return !!v;
    case "admin": return cell?.source === "admin";
    case "api": return cell?.source === "api";
    case "contains": return !t || v.toLowerCase().includes(t);
    case "is": return v.toLowerCase() === t || parts(v).includes(t);
    case "not": return v.toLowerCase() !== t && !parts(v).includes(t);
    case "gt": case "lt": {
      const a = Number(v), b = Number(t);
      if (Number.isFinite(a) && Number.isFinite(b) && v !== "" && t !== "") return f.op === "gt" ? a > b : a < b;
      return !!v && !!t && (f.op === "gt" ? v > t : v < t); // dates compare as text
    }
  }
}

export function ValuesGrid({ entity, cols, rows, save, rebuild }: {
  entity: string; cols: GridCol[]; rows: GridRow[]; save: (form: FormData) => Promise<string>;
  /** Drops and rebuilds the future puzzles that froze these values. */
  rebuild?: () => Promise<string>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const noun = entity === "hero" ? "heroes" : "items";

  // Distinct values per column (for the filter suggestions).
  const values = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, [...new Set(rows.flatMap((r) => {
    const v = r.cells[c.key]?.value ?? "";
    return c.type === "multi" ? v.split(/[,/]/).map((x) => x.trim()).filter(Boolean) : v ? [v] : [];
  }))].sort()])), [cols, rows]);

  const shown = useMemo(() => rows.filter((r) =>
    `${r.name} ${r.sub ?? ""}`.toLowerCase().includes(name.toLowerCase()) &&
    filters.every((f) => matches(r.cells[f.col], f))), [rows, name, filters]);
  const visible = cols.filter((c) => !hidden.has(c.key));
  const dirty = Object.keys(edits).length;

  const setFilter = (i: number, patch: Partial<Filter>) => setFilters((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const run = (fn: () => Promise<string>, after?: () => void) => start(async () => {
    try {
      setMsg(await fn());
      after?.();
    } catch (e) {
      setMsg((e as Error).message);
    }
  });
  const submit = () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(edits)) form.set(k, v);
    run(() => save(form), () => { setEdits({}); setSaved(true); });
  };

  const input = "rounded border border-neutral-300 px-2 py-1 text-sm";
  return (
    <div>
      <div className="mb-3 space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Search ${noun}`} className={`${input} w-56`} />
          <button type="button" onClick={() => setFilters((fs) => [...fs, { col: cols[0]?.key ?? "", op: "is", text: "" }])} className="rounded border border-neutral-300 bg-white px-2.5 py-1 hover:bg-neutral-100">
            + Filter by category
          </button>
          <button type="button" onClick={() => setFilters((fs) => [...fs, { col: cols[0]?.key ?? "", op: "empty", text: "" }])} className="rounded border border-neutral-300 bg-white px-2.5 py-1 hover:bg-neutral-100">
            + Missing values
          </button>
          {(filters.length > 0 || name) && (
            <button type="button" onClick={() => { setFilters([]); setName(""); }} className="text-xs text-blue-700 hover:underline">Clear filters</button>
          )}
          <span className="ml-auto text-xs text-neutral-600">{shown.length} of {rows.length} {noun}</span>
        </div>
        {filters.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-10 text-right text-xs text-neutral-500">{i === 0 ? "where" : "and"}</span>
            <select value={f.col} onChange={(e) => setFilter(i, { col: e.target.value })} className={input}>
              {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as Op })} className={input}>
              {OPS.map(([op, label]) => <option key={op} value={op}>{label}</option>)}
            </select>
            {NEEDS_TEXT.has(f.op) && (
              <>
                <input value={f.text} onChange={(e) => setFilter(i, { text: e.target.value })} list={`vals-${i}`} placeholder="value" className={`${input} w-44`} />
                <datalist id={`vals-${i}`}>{(values[f.col] ?? []).map((v) => <option key={v} value={v} />)}</datalist>
              </>
            )}
            <button type="button" onClick={() => setFilters((fs) => fs.filter((_, k) => k !== i))} aria-label="Remove filter" className="px-1 text-neutral-500 hover:text-red-600">✕</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-neutral-500">Columns:</span>
          {cols.map((c) => {
            const on = !hidden.has(c.key);
            return (
              <button
                key={c.key} type="button" aria-pressed={on}
                onClick={() => setHidden((h) => { const n = new Set(h); if (on) n.add(c.key); else n.delete(c.key); return n; })}
                className={`rounded-full px-2 py-0.5 text-xs ring-1 ${on ? "bg-white ring-neutral-400" : "bg-neutral-100 text-neutral-400 ring-neutral-200 line-through"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-blue-100 ring-1 ring-blue-300" /> set by admin</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-50 ring-1 ring-red-300" /> missing</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-400" /> unsaved</span>
        <span className="flex-1" />
        {msg && <span className="max-w-xl text-xs text-neutral-700">{msg}</span>}
        {rebuild && saved && dirty === 0 && (
          <button
            type="button" disabled={pending}
            onClick={() => { if (window.confirm("Drop the future puzzles that use these values and build them again now?")) run(rebuild, () => setSaved(false)); }}
            className="rounded border border-amber-500 bg-amber-50 px-3 py-1 text-amber-800 disabled:opacity-40"
          >
            Rebuild future puzzles with this data
          </button>
        )}
        <button type="button" disabled={!dirty || pending} onClick={submit} className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40">
          {pending ? "Working…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mb-2 text-xs text-neutral-500">Empty an API value to go back to the API. For curated and custom categories, empty removes the value. Saved values reach puzzles built after the save: rebuild the future days to apply them there.</p>
      <div className="max-h-[70vh] overflow-auto rounded border border-neutral-300 bg-white">
        <table className="text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50">
            <tr className="text-left">
              <th className="sticky left-0 z-10 bg-neutral-50 px-2 py-1.5">{entity === "hero" ? "Hero" : "Item"}</th>
              {visible.map((c) => (
                <th key={c.key} className={`px-1 py-1.5 font-medium ${c.disabled ? "text-neutral-400 line-through" : ""}`}>
                  {c.label}{c.unit ? ` (${c.unit})` : ""}
                  <div className="text-[10px] font-normal text-neutral-500">{HELP[c.type] ?? c.type}{c.custom ? " · custom" : ""}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="sticky left-0 bg-white px-2 py-1">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.icon && <img src={r.icon} alt="" className="h-6 w-6 rounded bg-neutral-800 object-contain" />}
                    {r.href ? <a href={r.href} className="text-blue-700 hover:underline">{r.name}</a> : <span>{r.name}</span>}
                    {r.sub && <span className="text-xs text-neutral-500">{r.sub}</span>}
                  </div>
                </td>
                {visible.map((c) => {
                  const cell = r.cells[c.key];
                  const key = `v|${r.id}|${c.key}`;
                  const edited = key in edits;
                  const tone = edited ? "bg-amber-100 ring-amber-400" : cell.source === "admin" ? "bg-blue-100 ring-blue-300" : cell.source === "missing" ? "bg-red-50 ring-red-300" : "bg-white ring-neutral-300";
                  return (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        value={edited ? edits[key] : cell.value}
                        title={cell.source === "admin" && cell.api ? `API: ${cell.api}` : cell.source === "api" ? "From the API" : undefined}
                        aria-label={`${r.name}: ${c.label}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEdits((cur) => {
                            const next = { ...cur };
                            if (v === cell.value) delete next[key];
                            else next[key] = v;
                            return next;
                          });
                        }}
                        className={`w-28 rounded px-1.5 py-0.5 ring-1 ${tone}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
