// Debug preview: any lock, any day (future ones too), at any reveal step, normal or hard, exactly as rendered for
// players, with its answer, hints, bonus and leak check. Read-only.
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCKS, getLock } from "@/locks.config";
import { isDay, todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { getPuzzle } from "@/lib/server/puzzles";
import { MODES } from "@/lib/engine/registry";
import { checkLeaks } from "@/lib/engine/leaks";
import type { BasePayload } from "@/lib/engine/mode";
import { Card, PageHeader, Pill } from "../kit";
import { DebugStage, ResetLocal } from "./DebugStage";

export const dynamic = "force-dynamic";

type Q = { slug?: string; date?: string; w?: string; hard?: string; done?: string };

export default async function DebugPage({ searchParams }: { searchParams: Promise<Q> }) {
  await requireAdminPage();
  const q = await searchParams;
  const today = todayDate();
  const lock = getLock(q.slug ?? "") ?? LOCKS[0];
  const date = isDay(q.date) ? q.date : today;
  const wrong = Math.max(0, Math.min(20, Number(q.w ?? 0) || 0));
  const hard = q.hard === "1";
  const done = q.done === "1";
  const row = await getPuzzle(date, lock.slug);
  const impl = MODES[lock.mode];
  const payload = row && !row.sealed ? (row.payload as unknown as BasePayload) : null;
  const engine = !!impl && !!payload && lock.group !== "omens" && !lock.box;
  const clue = engine ? impl.clue(payload!, wrong, done, { hard }) : null;
  const leaks = engine ? checkLeaks(payload!) : [];
  const href = (patch: Partial<Q>) => {
    const p = new URLSearchParams({ slug: lock.slug, date, w: String(wrong), ...(hard ? { hard: "1" } : {}), ...(done ? { done: "1" } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) p.delete(k);
      else p.set(k, String(v));
    }
    return `/admin/debug?${p}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Debug preview" subtitle="See any lock on any day at any step, as players see it. Nothing here changes a puzzle." />
      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm" action="/admin/debug">
          <label>Lock<br />
            <select name="slug" defaultValue={lock.slug} className="rounded border border-neutral-400 px-2 py-1">
              {LOCKS.map((l) => <option key={l.slug} value={l.slug}>{l.numeral} · {l.name}{l.table ? ` · ${l.table.label}` : ""}</option>)}
            </select>
          </label>
          <label>Day<br /><input type="date" name="date" defaultValue={date} className="rounded border border-neutral-400 px-2 py-1" /></label>
          <label>Wrong guesses<br /><input type="number" name="w" min={0} max={20} defaultValue={wrong} className="w-20 rounded border border-neutral-400 px-2 py-1" /></label>
          {lock.hard && <label className="flex items-center gap-1"><input type="checkbox" name="hard" value="1" defaultChecked={hard} /> Hard</label>}
          <label className="flex items-center gap-1"><input type="checkbox" name="done" value="1" defaultChecked={done} /> Finished (full reveal)</label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Show</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Link className="text-blue-700 hover:underline" href={href({ date: addDays(date, -1) })}>← previous day</Link>
          <Link className="text-blue-700 hover:underline" href={href({ date: addDays(date, 1) })}>next day →</Link>
          {Array.from({ length: 9 }, (_, w) => <Link key={w} href={href({ w: String(w) })} className={`rounded px-2 ${w === wrong ? "bg-neutral-900 text-white" : "text-blue-700 hover:bg-neutral-100"}`}>{w}</Link>)}
          <span className="mx-2 text-neutral-400">|</span>
          {date <= today && <Link className="text-blue-700 hover:underline" href={`/lock/${lock.slug}${date < today ? `?d=${date}` : ""}`} target="_blank">Open as player</Link>}
          <ResetLocal date={date} slug={lock.slug} />
        </div>
      </Card>

      {!row ? (
        <Card><p>No puzzle generated for {lock.name} on {date}. Generate it from the <Link className="text-blue-700 hover:underline" href={`/admin/puzzles/${lock.slug}`}>lock page</Link>.</p></Card>
      ) : row.sealed ? (
        <Card><p><Pill tone="red">Sealed</Pill> {row.sealedReason}</p></Card>
      ) : !engine ? (
        <Card><p>{lock.name} has its own tools: <Link className="text-blue-700 hover:underline" href={lock.group === "omens" ? "/admin/omens" : "/admin/seance/preview"}>{lock.group === "omens" ? "Omens" : "Séance preview"}</Link>.</p></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title={`Clue after ${wrong} wrong ${wrong === 1 ? "guess" : "guesses"}${hard ? " (hard)" : ""}${done ? ", finished" : ""}`}>
            <DebugStage clue={clue!} done={done} today={today} subject={lock.guess === "item" ? "item" : "hero"} />
          </Card>
          <div className="space-y-4">
            <Card title="Answer">
              <p className="text-lg font-semibold">{payload!.answer.name} {payload!.answer.sub && <span className="text-sm font-normal text-neutral-500">· {payload!.answer.sub}</span>}</p>
              <p className="text-xs text-neutral-500">answerId {row.answerId}{row.overridden ? " · overridden" : ""} · correct ids {payload!.correctIds.join(", ") || "(judged by the mode)"}</p>
              {payload!.bonus && <p className="mt-2 text-sm">Bonus: {payload!.bonus.prompt} → <b>{payload!.bonus.options.find((o) => o.id === payload!.bonus!.answerId)?.name}</b></p>}
            </Card>
            <Card title="Leak check">
              {leaks.length ? <ul className="text-sm text-red-700">{leaks.map((l, i) => <li key={i}>“{l.term}” in {l.text}</li>)}</ul> : <p className="text-sm text-green-700">No answer term in anything shown before the win.</p>}
            </Card>
            <Card title="Frozen payload">
              <pre className="max-h-[32rem] overflow-auto rounded bg-neutral-100 p-2 text-xs">{JSON.stringify(payload, null, 1)}</pre>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
