"use client";
// Small client helpers for the admin (plain UI).
import { useState, useTransition } from "react";
import { loadStore, saveStore } from "@/lib/client/store";

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
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        {pending ? "Working…" : label}
      </button>
      {msg && <span className="text-xs text-neutral-600">{msg}</span>}
    </span>
  );
}

/** Re-lock today's puzzles for testing: the account's recorded plays (server) and this browser's local progress for today. */
export function RelockButton({ action, today }: { action: () => Promise<string>; today: string }) {
  return (
    <ActionButton
      label="Lock puzzles again (my account, today)"
      confirm="Reset all of today's puzzles for your account, so they can be played again? Your solved state and souls for today are deleted."
      action={async () => {
        const msg = await action();
        const store = loadStore();
        delete store.progress[today];
        saveStore(store);
        return msg;
      }}
    />
  );
}
