"use client";
// Client pieces of the puzzle setup editor: on/off switches, list editors (emojis, build items), the portrait form.
import { useActionState, useState, useTransition } from "react";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, ok = "Saved") => {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(ok);
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  };
  return { pending, msg, run };
}

const btn = "rounded border border-neutral-400 bg-neutral-50 px-2 py-0.5 text-sm hover:bg-neutral-200 disabled:opacity-50";

/** A mode (or ability-in-mode) switch. `action(on)` persists it. */
export function ModeSwitch({ on, label, action }: { on: boolean; label: string; action: (on: boolean) => Promise<unknown> }) {
  const { pending, msg, run } = useRun();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" defaultChecked={on} disabled={pending} onChange={(e) => { const v = e.target.checked; run(() => action(v)); }} />
      {label}
      {msg && msg !== "Saved" && <span className="text-xs text-red-700">{msg}</span>}
    </label>
  );
}

const firstGrapheme = (s: string) => {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...seg.segment(s.trim())][0]?.segment ?? "";
};

/** Emoji set: add, remove and reorder. Puzzles show `puzzle` of them, always one of the last 3. */
export function EmojiList({ initial, min, max, puzzle, save }: {
  initial: string[]; min: number; max: number; puzzle: number; save: (emojis: string[]) => Promise<unknown>;
}) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const { pending, msg, run } = useRun();
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const add = () => {
    const e = firstGrapheme(draft);
    if (!e || list.length >= max) return;
    setList([...list, e]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-600">
        Hardest first, most obvious last. Each puzzle shows {puzzle} of them, always including one of the last 3.
        The hero needs at least {min} to be in the pool ({list.length}/{max}).
      </p>
      <ol className="flex flex-wrap gap-2">
        {list.map((e, i) => (
          <li key={`${i}-${e}`} className={`flex items-center gap-1 rounded border px-1.5 py-1 ${i >= list.length - 3 ? "border-amber-400 bg-amber-50" : "border-neutral-300"}`}>
            <span className="w-4 text-right text-xs text-neutral-500">{i + 1}</span>
            <span className="text-2xl leading-none">{e}</span>
            <span className="flex flex-col">
              <button type="button" aria-label="Move earlier" className="px-1 text-xs leading-none" onClick={() => move(i, -1)}>◀</button>
              <button type="button" aria-label="Move later" className="px-1 text-xs leading-none" onClick={() => move(i, 1)}>▶</button>
            </span>
            <button type="button" aria-label={`Remove ${e}`} className="px-1 text-red-700" onClick={() => setList(list.filter((_, k) => k !== i))}>×</button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Emoji (Win + . / Ctrl+Cmd+Space)" className="w-56 rounded border border-neutral-400 px-2 py-1" />
        <button type="button" className={btn} onClick={add} disabled={list.length >= max}>Add</button>
        <button type="button" className={`${btn} bg-neutral-900 text-white hover:bg-neutral-700`} disabled={pending} onClick={() => run(() => save(list))}>
          {pending ? "Saving…" : "Save emojis"}
        </button>
        {list.length < min && <span className="text-xs text-amber-700">Below {min}: puzzles use the built-in default set until this one is complete.</span>}
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
      </div>
    </div>
  );
}

type Opt = { cls: string; name: string };

function ItemList({ title, hint, items, setItems, options, max }: {
  title: string; hint: string; items: string[]; setItems: (l: string[]) => void; options: Opt[]; max?: number;
}) {
  const [draft, setDraft] = useState("");
  const byName = new Map(options.map((o) => [o.name.toLowerCase(), o.cls]));
  const nameOf = new Map(options.map((o) => [o.cls, o.name]));
  const add = () => {
    const cls = byName.get(draft.trim().toLowerCase());
    if (!cls || items.includes(cls) || (max && items.length >= max)) return;
    setItems([...items, cls]);
    setDraft("");
  };
  const id = `items-${title.replace(/\W/g, "")}`;
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mb-1 text-xs text-neutral-600">{hint}</p>
      <ul className="mb-1 flex flex-wrap gap-1">
        {items.length === 0 && <li className="text-xs text-neutral-500">None</li>}
        {items.map((c) => (
          <li key={c} className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-0.5 text-sm">
            {nameOf.get(c) ?? c}
            <button type="button" aria-label="Remove" className="text-red-700" onClick={() => setItems(items.filter((x) => x !== c))}>×</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input list={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Item name" className="w-56 rounded border border-neutral-400 px-2 py-1 text-sm" />
        <datalist id={id}>{options.map((o) => <option key={o.cls} value={o.name} />)}</datalist>
        <button type="button" className={btn} onClick={add}>Add</button>
      </div>
    </div>
  );
}

export function BuildItems({ pin, ban, options, max, save }: {
  pin: string[]; ban: string[]; options: Opt[]; max: number; save: (pin: string[], ban: string[]) => Promise<unknown>;
}) {
  const [pins, setPins] = useState(pin);
  const [bans, setBans] = useState(ban);
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <ItemList title="Always show" hint={`Shown as the most telling items (revealed last). Up to ${max}; 5 or more also cover heroes without enough match data.`}
          items={pins} setItems={setPins} options={options} max={max} />
        <ItemList title="Never show" hint="Left out even when the match data finds them distinctive." items={bans} setItems={setBans} options={options} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={`${btn} bg-neutral-900 text-white hover:bg-neutral-700`} disabled={pending} onClick={() => run(() => save(pins, bans))}>
          {pending ? "Saving…" : "Save items"}
        </button>
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
      </div>
    </div>
  );
}

export function SplashForm({ current, action, name = "splash", placeholder = "Image URL (empty = API card)", button = "Save portrait" }: {
  current: string; action: (form: FormData) => Promise<string | null>; name?: string; placeholder?: string; button?: string;
}) {
  const [err, submit, pending] = useActionState(async (_: string | null | undefined, form: FormData) => action(form), undefined);
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input name={name} defaultValue={current} placeholder={placeholder} className="min-w-0 flex-1 rounded border border-neutral-400 px-2 py-1 text-sm" />
      <button className={`${btn} bg-neutral-900 text-white hover:bg-neutral-700`} disabled={pending}>{pending ? "Saving…" : button}</button>
      {err === null && <span className="text-xs text-neutral-600">Saved</span>}
      {err && <span className="text-xs text-red-700">{err}</span>}
    </form>
  );
}

type AttrField = { key: string; label: string; type: string; unit?: string; disabled: boolean; value: string; source: "api" | "admin" | "missing" };
const TYPE_HINT: Record<string, string> = { exact: "", multi: "comma-separated", numeric: "number", date: "YYYY-MM-DD" };

/** The Reckoning: every category's value for one hero (empty = API value, or no value for custom ones). */
export function AttributesForm({ heroId, fields, aliases, action }: {
  heroId: number; fields: AttrField[]; aliases: string; action: (form: FormData) => Promise<string>;
}) {
  const [msg, submit, pending] = useActionState(async (_: string | undefined, form: FormData) => action(form), undefined);
  return (
    <form action={submit} className="grid gap-3 md:grid-cols-3">
      {fields.map((f) => (
        <label key={f.key} className={`text-sm ${f.disabled ? "text-neutral-400" : ""}`}>
          {f.label}{f.unit ? ` (${f.unit})` : ""}{" "}
          <span className="text-xs text-neutral-500">
            {[TYPE_HINT[f.type], f.disabled ? "switched off" : f.source === "missing" ? "missing" : f.source === "admin" ? "set by admin" : "from API"].filter(Boolean).join(" · ")}
          </span>
          <input name={`v|${heroId}|${f.key}`} defaultValue={f.value}
            className={`w-full rounded border px-2 py-1 ${f.source === "missing" && !f.disabled ? "border-red-300 bg-red-50" : f.source === "admin" ? "border-blue-300 bg-blue-50" : "border-neutral-400"}`} />
        </label>
      ))}
      <label className="text-sm md:col-span-3">Aliases <span className="text-xs text-neutral-500">(comma-separated; search and redaction in every mode)</span>
        <input name="aliases" defaultValue={aliases} className="w-full rounded border border-neutral-400 px-2 py-1" />
      </label>
      <div className="flex items-center gap-3 md:col-span-3">
        <button className="rounded bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700" disabled={pending}>{pending ? "Saving…" : "Save attributes"}</button>
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
      </div>
    </form>
  );
}
