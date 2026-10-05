"use client";
// Endless mode: resumes this lock's practice puzzle in progress, or asks the server for a new one, then plays it with
// the regular lock UI (LockGame in endless mode).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CatalogEntry, PlayView } from "@/lib/engine/types";
import type { Codex } from "@/lib/codex";
import { loadEndless, recordEndless, saveEndless } from "@/lib/client/endless";
import type { LockRecord } from "@/lib/client/store";
import { LockGame } from "./LockGame";
import { DecoFrame, KeyholeLoader } from "./ui";

type Ready = { token: string; view: PlayView; rec?: LockRecord };

async function post(body: unknown) {
  const res = await fetch("/api/endless", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: res.ok ? await res.json() : null };
}

export function EndlessLock({ slug, entries, codex, site, rules }: { slug: string; entries: CatalogEntry[]; codex?: Codex; site: string; rules: string }) {
  const [state, setState] = useState<Ready | { error: string } | null>(null);
  const [rec, setRec] = useState<LockRecord | undefined>(undefined);

  useEffect(() => {
    let live = true;
    (async () => {
      const d = loadEndless();
      const cur = d.current[slug];
      const unfinished = cur && (!cur.rec || cur.rec.s === "playing");
      // Resume the puzzle in progress (unless it was pruned), else start a new one.
      if (unfinished) {
        const r = await post({ token: cur.token, guesses: cur.rec?.g ?? [], bonus: cur.rec?.b, hard: cur.rec?.hard });
        if (r.json && live) { setRec(cur.rec); setState({ token: cur.token, view: r.json, rec: cur.rec }); return; }
      }
      const made = await post({ slug, avoid: d.recent[slug] ?? [] });
      if (!live) return;
      if (!made.json) {
        setState({ error: made.status === 429 ? "Slow down a little: try again in a minute." : made.status === 409 ? "This lock has nothing to build right now." : "The lock won't turn. Try again." });
        return;
      }
      const token = made.json.token as string;
      saveEndless({ ...d, current: { ...d.current, [slug]: { token } } });
      const first = await post({ token, guesses: [] });
      if (live) setState(first.json ? { token, view: first.json } : { error: "The lock won't turn. Try again." });
    })().catch(() => live && setState({ error: "The lock won't turn. Try again." }));
    return () => { live = false; };
  }, [slug]);

  const onRecord = useCallback((r: LockRecord, answerKey?: string) => {
    if (!state || "error" in state) return;
    saveEndless(recordEndless(loadEndless(), slug, state.token, r, answerKey));
    setRec(r);
  }, [slug, state]);

  if (!state) return <KeyholeLoader />;
  if ("error" in state) {
    return (
      <DecoFrame className="p-8 text-center">
        <p className="text-paper">{state.error}</p>
        <Link href="/endless" className="mt-3 inline-block text-brass underline-offset-4 hover:underline">All endless locks</Link>
      </DecoFrame>
    );
  }
  return (
    <LockGame
      key={state.token}
      slug={slug} date="endless" number={0} initialView={state.view} entries={entries} codex={codex} site={site} available={[]} rules={rules}
      endless={{ token: state.token, rec, onRecord, nextHref: `/endless/${slug}?n=${state.token.slice(0, 8)}` }}
    />
  );
}
