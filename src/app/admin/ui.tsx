"use client";
// Small client helpers for the admin (plain UI).
import { useState, useTransition } from "react";

export function ActionButton({ action, label, confirm }: { action: () => Promise<unknown>; label: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMsg(null);
          start(async () => {
            try {
              const r = await action();
              setMsg(typeof r === "string" ? r : "Done");
            } catch (e) {
              setMsg((e as Error).message);
            }
          });
        }}
        className="rounded border border-neutral-400 bg-neutral-50 px-3 py-1 text-sm hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Working…" : label}
      </button>
      {msg && <span className="text-xs text-neutral-600">{msg}</span>}
    </span>
  );
}
