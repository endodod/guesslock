"use client";
// One category for every hero or item on one page: type values, or click a known value to set it (multi-value
// categories toggle it), or select rows and set them all at once. Only changed rows are sent on save.
import { useMemo, useState, useTransition } from "react";

export type ColumnRow = { id: number; name: string; icon: string | null; sub?: string; href?: string; value: string; source: "api" | "admin" | "missing"; api?: string };

const split = (v: string) => v.split(/[,/]/).map((x) => x.trim()).filter(Boolean);

export function ColumnEditor({ entity, colKey, type, rows, save, rebuild }: {
  entity: string; colKey: string; type: string; rows: ColumnRow[];
  save: (form: FormData) => Promise<string>;
  rebuild: () => Promise<string>;
}) {
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "missing" | "admin">("all");
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const multi = type === "multi";
  const pickable = type === "exact" || multi;

  const valueOf = (r: ColumnRow) => (r.id in edits ? edits[r.id] : r.value);
  const setValue = (r: ColumnRow, v: string) => setEdits((cur) => {
    const next = { ...cur };
    if (v === r.value) delete next[r.id];
    else next[r.id] = v;
    return next;
  });
  // Known values (from saved and unsaved rows), most used first.
  const known = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows) for (const v of multi ? split(valueOf(r)) : valueOf(r) ? [valueOf(r)] : []) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows, edits, multi]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rows.filter((r) =>
    `${r.name} ${r.sub ?? ""} ${valueOf(r)}`.toLowerCase().includes(search.toLowerCase()) &&
    (show === "all" || (show === "missing" ? !valueOf(r).trim() : r.source === "admin")));
  const dirty = Object.keys(edits).length;

  const toggle = (r: ColumnRow, v: string) => {
    if (!multi) return setValue(r, valueOf(r) === v ? "" : v);
    const cur = split(valueOf(r));
    setValue(r, (cur.some((x) => x.toLowerCase() === v.toLowerCase()) ? cur.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...cur, v]).join(", "));
  };
  const applyBulk = (mode: "set" | "add" | "remove" | "clear") => {
    const v = bulk.trim();
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      const cur = split(valueOf(r));
      if (mode === "clear") setValue(r, "");
      else if (!v) continue;
      else if (mode === "set") setValue(r, v);
      else if (mode === "add" && !cur.some((x) => x.toLowerCase() === v.toLowerCase())) setValue(r, [...cur, v].join(", "));
      else if (mode === "remove") setValue(r, cur.filter((x) => x.toLowerCase() !== v.toLowerCase()).join(", "));
    }
  };
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
    for (const [id, v] of Object.entries(edits)) form.set(`v|${id}|${colKey}`, v);
    run(() => save(form), () => { setEdits({}); setSaved(true); });
  };

  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const btn = "rounded border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40";
  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${entity === "hero" ? "heroes" : "items"} or values`} className="w-56 rounded border border-neutral-300 px-2 py-1" />
          {(["all", "missing", "admin"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`${btn} ${show === k ? "!bg-neutral-900 text-white" : ""}`}>
              {k === "all" ? "All" : k === "missing" ? "Missing" : "Set by admin"}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-600">{shown.length} shown · {rows.filter((r) => !valueOf(r).trim()).length} missing</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">{selected.size} selected:</span>
          <input value={bulk} onChange={(e) => setBulk(e.target.value)} list="known-values" placeholder="value" className="w-44 rounded border border-neutral-300 px-2 py-1" />
          <datalist id="known-values">{known.map(([v]) => <option key={v} value={v} />)}</datalist>
          <button type="button" disabled={!selected.size || !bulk.trim()} onClick={() => applyBulk("set")} className={btn}>Set</button>
          {multi && <button type="button" disabled={!selected.size || !bulk.trim()} onClick={() => applyBulk("add")} className={btn}>Add</button>}
          {multi && <button type="button" disabled={!selected.size || !bulk.trim()} onClick={() => applyBulk("remove")} className={btn}>Remove</button>}
          <button type="button" disabled={!selected.size} onClick={() => applyBulk("clear")} className={btn}>Empty</button>
          <button type="button" disabled={!selected.size} onClick={() => setSelected(new Set())} className="text-xs text-blue-700 hover:underline disabled:opacity-40">Unselect</button>
          <span className="flex-1" />
          {msg && <span className="max-w-md text-xs text-neutral-700">{msg}</span>}
          {saved && dirty === 0 && (
            <button
              type="button" disabled={pending}
              onClick={() => { if (window.confirm("Drop the future puzzles that use these values and build them again now?")) run(rebuild, () => setSaved(false)); }}
              className="rounded border border-amber-500 bg-amber-50 px-3 py-1 text-amber-800 disabled:opacity-40"
            >
              Rebuild future puzzles
            </button>
          )}
          <button type="button" disabled={!dirty || pending} onClick={submit} className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40">
            {pending ? "Working…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-8 py-2">
              <input
                type="checkbox" checked={allShown} aria-label="Select all shown"
                onChange={() => setSelected((s) => { const n = new Set(s); for (const r of shown) { if (allShown) n.delete(r.id); else n.add(r.id); } return n; })}
              />
            </th>
            <th className="pr-3">{entity === "hero" ? "Hero" : "Item"}</th>
            <th className="pr-3">Value</th>
            {pickable && <th>Quick pick</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {shown.map((r) => {
            const v = valueOf(r);
            const edited = r.id in edits;
            const tone = edited ? "bg-amber-50 border-amber-400" : r.source === "admin" ? "bg-blue-50 border-blue-300" : !v.trim() ? "bg-red-50 border-red-300" : "border-neutral-300";
            const parts = multi ? split(v).map((x) => x.toLowerCase()) : [v.toLowerCase()];
            return (
              <tr key={r.id} className={selected.has(r.id) ? "bg-blue-50/40" : ""}>
                <td className="py-1.5">
                  <input type="checkbox" checked={selected.has(r.id)} aria-label={`Select ${r.name}`} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                </td>
                <td className="whitespace-nowrap pr-3">
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.icon && <img src={r.icon} alt="" className="h-7 w-7 rounded bg-neutral-800 object-contain" />}
                    {r.href ? <a href={r.href} className="text-blue-700 hover:underline">{r.name}</a> : r.name}
                    {r.sub && <span className="text-xs text-neutral-500">{r.sub}</span>}
                  </span>
                </td>
                <td className="pr-3">
                  <input
                    value={v} onChange={(e) => setValue(r, e.target.value)} aria-label={`${r.name} value`}
                    placeholder={r.api ? `API: ${r.api}` : "missing"} title={r.api ? `API: ${r.api}` : undefined}
                    className={`w-56 rounded border px-2 py-1 ${tone}`}
                  />
                </td>
                {pickable && (
                  <td className="py-1">
                    <span className="flex flex-wrap gap-1">
                      {known.slice(0, 14).map(([k]) => {
                        const on = parts.includes(k.toLowerCase());
                        return (
                          <button key={k} type="button" onClick={() => toggle(r, k)} aria-pressed={on} className={`rounded-full px-2 py-0.5 text-xs ring-1 ${on ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white text-neutral-700 ring-neutral-300 hover:bg-neutral-100"}`}>
                            {k}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
