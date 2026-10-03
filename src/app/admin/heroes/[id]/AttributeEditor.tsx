"use client";
// Every category value of one hero (built-in, curated and custom, e.g. Role or Height), editable in one place.
// Only changed fields are sent; an emptied field goes back to the API value (or removes a curated/custom value).
import { useState, useTransition } from "react";

export type AttrField = {
  key: string; label: string; type: string; unit?: string; info: string;
  value: string; source: "api" | "admin" | "missing"; api?: string; custom?: boolean; disabled?: boolean;
};

const HELP: Record<string, string> = { exact: "text", multi: "comma-separated", numeric: "number or none", date: "YYYY-MM-DD" };

export function AttributeEditor({ id, fields, save, rebuild }: {
  id: number; fields: AttrField[];
  save: (form: FormData) => Promise<string>;
  rebuild: () => Promise<string>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = Object.keys(edits).length;

  const run = (fn: () => Promise<string>, after?: () => void) => start(async () => {
    try {
      setMsg(await fn());
      after?.();
    } catch (e) {
      setMsg((e as Error).message);
    }
  });

  return (
    <div>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {fields.map((f) => {
          const name = `v|${id}|${f.key}`;
          const edited = name in edits;
          const tone = edited ? "bg-amber-50 border-amber-400" : f.source === "admin" ? "bg-blue-50 border-blue-300" : f.source === "missing" ? "bg-red-50 border-red-300" : "border-neutral-300";
          return (
            <label key={f.key} className="block text-sm">
              <span className={`font-medium ${f.disabled ? "text-neutral-400 line-through" : ""}`}>{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
              <span className="ml-2 text-xs text-neutral-500">
                {HELP[f.type] ?? f.type}{f.custom ? " · custom" : ""}
                {f.api !== undefined ? ` · API: ${f.api}` : f.custom ? "" : " · curated"}
                {f.disabled ? " · switched off" : ""}
              </span>
              <input
                value={edited ? edits[name] : f.value}
                placeholder={f.source === "missing" ? "missing" : undefined}
                title={f.info}
                onChange={(e) => {
                  const v = e.target.value;
                  setEdits((cur) => {
                    const next = { ...cur };
                    if (v === f.value) delete next[name];
                    else next[name] = v;
                    return next;
                  });
                }}
                className={`mt-1 w-full rounded border px-2 py-1 ${tone}`}
              />
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button" disabled={!dirty || pending}
          onClick={() => {
            const form = new FormData();
            for (const [k, v] of Object.entries(edits)) form.set(k, v);
            run(() => save(form), () => { setEdits({}); setSaved(true); });
          }}
          className="rounded bg-neutral-900 px-4 py-1.5 text-white disabled:opacity-40"
        >
          {pending ? "Working…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}
        </button>
        {saved && dirty === 0 && (
          <button
            type="button" disabled={pending}
            onClick={() => { if (window.confirm("Drop the future Reckoning and Constellation puzzles and build them again with the new values?")) run(rebuild, () => setSaved(false)); }}
            className="rounded border border-amber-500 bg-amber-50 px-3 py-1.5 text-amber-800 disabled:opacity-40"
          >
            Rebuild future puzzles with this data
          </button>
        )}
        {msg && <span className="text-xs text-neutral-700">{msg}</span>}
      </div>
    </div>
  );
}
