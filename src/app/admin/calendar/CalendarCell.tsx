"use client";
import { useRef, useState, useTransition } from "react";
import { overrideDay, regenerateDay } from "../actions";

type Current = { answerId: string; name: string | null; sealed: boolean; sealedReason: string | null; overridden: boolean } | null;

/** Plain play/stop button for a mirrored clip (admin preview). */
function PreviewButton({ label, url }: { label: string; url: string }) {
  const a = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-neutral-300 px-1 text-xs"
      onClick={() => {
        if (!a.current) {
          a.current = new Audio(url);
          a.current.onended = () => setOn(false);
        }
        const el = a.current;
        if (on) { el.pause(); el.currentTime = 0; setOn(false); } else { void el.play(); setOn(true); }
      }}
    >
      {on ? "■" : "▶"} {label}
    </button>
  );
}

export function CalendarCell({ date, slug, isFuture, current, options, preview }: {
  date: string; slug: string; isFuture: boolean; current: Current; options: { id: string; name: string }[];
  preview?: { clips: { label: string; url: string }[]; ability?: string };
}) {
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => start(async () => {
    setErr(null);
    try { await fn(); setEditing(false); } catch (e) { setErr((e as Error).message); }
  });

  return (
    <div className="space-y-1">
      {current ? (
        current.sealed ? (
          <span className="text-red-700" title={current.sealedReason ?? ""}>sealed</span>
        ) : (
          <span>{current.name}{current.overridden && <span className="ml-1 text-xs text-blue-700">(override)</span>}</span>
        )
      ) : (
        <span className="text-neutral-400">not generated</span>
      )}
      {preview && (
        <div className="space-y-0.5">
          {preview.ability && <div className="text-xs text-neutral-600">{preview.ability}</div>}
          <div className="flex flex-wrap gap-1">{preview.clips.map((c) => <PreviewButton key={c.url + c.label} {...c} />)}</div>
        </div>
      )}
      <div className="text-xs text-neutral-500">{options.length} eligible</div>
      <div className="flex flex-wrap gap-1 text-xs">
        <button type="button" onClick={() => setEditing(!editing)} className="text-blue-700">override</button>
        {isFuture && (
          <button type="button" disabled={pending} onClick={() => run(() => regenerateDay(date, slug))} className="text-blue-700 disabled:opacity-50">regenerate</button>
        )}
      </div>
      {editing && (
        <div className="flex gap-1">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="max-w-36 rounded border border-neutral-400 text-xs">
            <option value="">Choose…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button
            type="button"
            disabled={!pick || pending}
            onClick={() => {
              if (!isFuture && !window.confirm("This day is live. Players who already started will see a different puzzle. Override anyway?")) return;
              run(() => overrideDay(date, slug, pick));
            }}
            className="rounded border border-neutral-400 px-1 text-xs disabled:opacity-50"
          >
            Set
          </button>
        </div>
      )}
      {err && <div className="text-xs text-red-700">{err}</div>}
    </div>
  );
}
