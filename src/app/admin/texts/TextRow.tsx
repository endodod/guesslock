"use client";
import { useState, useTransition } from "react";
import { approveText, resetText } from "../actions";

type Entry = { id: number; label: string; source: string; auto: string; final: string | null; status: string; stale: boolean };

export function TextRow({ entry }: { entry: Entry }) {
  const [text, setText] = useState(entry.final ?? entry.auto);
  const [status, setStatus] = useState(entry.status);
  const [pending, start] = useTransition();
  return (
    <li className="rounded border border-neutral-300 bg-white p-3">
      <div className="mb-2 flex items-center gap-3 text-sm">
        <strong>{entry.label}</strong>
        <span className={status === "auto" ? "text-amber-700" : "text-green-700"}>{status}</span>
        {entry.stale && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">stale: source changed after approval</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs text-neutral-500">Source (API)</div>
          <p className="whitespace-pre-line rounded bg-neutral-50 p-2 text-sm">{entry.source}</p>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Shown to players</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(14, Math.ceil(text.length / 60) + 1)} className="w-full rounded border border-neutral-400 p-2 text-sm" />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await approveText(entry.id, text); setStatus(text.trim() === entry.auto.trim() ? "approved" : "rewritten"); })}
              className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {text.trim() === entry.auto.trim() ? "Approve" : "Save rewrite"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await resetText(entry.id); setText(entry.auto); setStatus("auto"); })}
              className="rounded border border-neutral-400 px-3 py-1 text-sm"
            >
              Reset to auto
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
