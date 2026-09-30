"use client";
// Category values for every hero or item. Only changed cells are sent on save.
import { useMemo, useState, useTransition } from "react";

export type GridCol = { key: string; label: string; type: string; unit?: string; disabled?: boolean; custom?: boolean };
export type GridRow = { id: number; name: string; icon: string | null; sub?: string; cells: Record<string, { value: string; source: "api" | "admin" | "missing" }> };

const HELP: Record<string, string> = {
  exact: "text", multi: "a, b", numeric: "number or none", date: "YYYY-MM-DD",
};

export function ValuesGrid({ entity, cols, rows, save }: {
  entity: string; cols: GridCol[]; rows: GridRow[]; save: (form: FormData) => Promise<string>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => rows.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()) &&
    (!onlyMissing || cols.some((c) => !c.disabled && r.cells[c.key]?.source === "missing"))), [rows, cols, filter, onlyMissing]);
  const dirty = Object.keys(edits).length;

  const submit = () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(edits)) form.set(k, v);
    start(async () => {
      try {
        setMsg(await save(form));
        setEdits({});
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${entity === "hero" ? "heroes" : "items"}`} className="rounded border border-neutral-400 px-2 py-1" />
        <label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only rows with missing values</label>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-blue-100 ring-1 ring-blue-300" /> set by admin</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-50 ring-1 ring-red-300" /> missing</span>
        <span className="flex-1" />
        {msg && <span className="max-w-xl text-xs text-neutral-700">{msg}</span>}
        <button type="button" disabled={!dirty || pending} onClick={submit} className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40">
          {pending ? "Saving…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mb-2 text-xs text-neutral-500">Empty an API value to go back to the API. For custom categories, empty removes the value.</p>
      <div className="max-h-[70vh] overflow-auto rounded border border-neutral-300 bg-white">
        <table className="text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50">
            <tr className="text-left">
              <th className="sticky left-0 bg-neutral-50 px-2 py-1.5">{entity === "hero" ? "Hero" : "Item"}</th>
              {cols.map((c) => (
                <th key={c.key} className={`px-1 py-1.5 font-medium ${c.disabled ? "text-neutral-400 line-through" : ""}`}>
                  {c.label}{c.unit ? ` (${c.unit})` : ""}
                  <div className="text-[10px] font-normal text-neutral-500">{HELP[c.type] ?? c.type}</div>
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
                    <span>{r.name}</span>
                    {r.sub && <span className="text-xs text-neutral-500">{r.sub}</span>}
                  </div>
                </td>
                {cols.map((c) => {
                  const cell = r.cells[c.key];
                  const name = `v|${r.id}|${c.key}`;
                  const edited = name in edits;
                  const tone = edited ? "bg-amber-100 ring-amber-400" : cell.source === "admin" ? "bg-blue-100 ring-blue-300" : cell.source === "missing" ? "bg-red-50 ring-red-300" : "bg-white ring-neutral-300";
                  return (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        value={edited ? edits[name] : cell.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEdits((cur) => {
                            const next = { ...cur };
                            if (v === cell.value) delete next[name];
                            else next[name] = v;
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
