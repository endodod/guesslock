import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { SEANCE_LOCKS } from "@/locks.config";
import { isDay, todayDate } from "@/lib/day";
import { getPuzzle } from "@/lib/server/puzzles";
import { buildSeanceBoard, loadLibrary } from "@/lib/seance/library";
import type { SeancePayload } from "@/lib/seance/types";
import { ActionButton } from "../../ui";
import { applyBoard, resetBoard } from "../actions";

const RANK_BG = ["", "#c9a45c", "#7fe3c2", "#5b82d6", "#8c6bd8"];

/** One board: groups in rank order with difficulty, members, and which heroes are red herrings. */
function Board({ p, members }: { p: SeancePayload; members: Map<number, Set<number>> }) {
  const name = new Map(p.heroes.map((h) => [h.id, h.name]));
  return (
    <div className="space-y-2">
      <p className="text-sm text-neutral-600">{p.redHerrings} red herrings · display order: {p.heroes.map((h) => h.name).join(", ")}</p>
      {p.groups.map((g) => (
        <div key={g.categoryId} className="rounded p-2 text-sm" style={{ background: RANK_BG[g.rank] }}>
          <div className="font-semibold">
            {["", "I", "II", "III", "IV"][g.rank]} · {g.label} <span className="font-normal">(difficulty {g.difficulty}, category #{g.categoryId})</span>
          </div>
          {g.explanation && <div className="text-xs">{g.explanation}</div>}
          <div>{g.members.map((h) => name.get(h)).join(", ")}</div>
          {(() => {
            const decoys = p.heroes.filter((h) => !g.members.includes(h.id) && members.get(g.categoryId)?.has(h.id));
            return decoys.length ? <div className="text-xs">Also fits (red herrings): {decoys.map((h) => h.name).join(", ")}</div> : null;
          })()}
        </div>
      ))}
    </div>
  );
}

export default async function BoardPreview({ searchParams }: { searchParams: Promise<{ date?: string; table?: string; reroll?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayDate();
  const date = isDay(sp.date) ? sp.date : today;
  const lock = SEANCE_LOCKS.find((l) => l.table!.kind === sp.table) ?? SEANCE_LOCKS[0];
  const table = lock.table!.kind;
  const reroll = Math.max(0, Number(sp.reroll) || 0);
  const [built, current, lib] = await Promise.all([buildSeanceBoard(lock, date, reroll), getPuzzle(date, lock.slug), loadLibrary()]);
  const members = new Map(lib.categories.map((c) => [c.id, new Set(c.members)]));
  const link = (p: Record<string, string | number>) => `/admin/seance/preview?${new URLSearchParams({ date, table, reroll: String(reroll), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link className="text-blue-700 hover:underline" href="/admin/seance">← Séance categories</Link></p>
      <section className="rounded border border-neutral-300 bg-white p-4">
        <h1 className="mb-2 text-lg font-semibold">Séance board preview</h1>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col">Date <input type="date" name="date" defaultValue={date} className="rounded border border-neutral-400 px-1" /></label>
          <label className="flex flex-col">Table
            <select name="table" defaultValue={table} className="rounded border border-neutral-400 px-1 py-0.5">
              {SEANCE_LOCKS.map((l) => <option key={l.slug} value={l.table!.kind}>{l.table!.label}</option>)}
            </select>
          </label>
          <button className="rounded border border-neutral-400 bg-neutral-50 px-3 py-1 hover:bg-neutral-200">Preview</button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          The automatic board is reroll 0 (what the daily job generates for an empty day, given the no-repeat window).
          &quot;Use this board&quot; freezes the preview as the day&apos;s puzzle (an override, like the calendar&apos;s).
        </p>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">Frozen for {date} ({lock.table!.label})</h2>
        {!current ? <p className="text-sm text-neutral-500">Not generated yet.</p>
          : current.sealed ? <p className="text-sm text-red-700">Sealed: {current.sealedReason}</p>
          : <>{current.overridden && <p className="text-xs text-blue-700">Override</p>}<Board p={current.payload as unknown as SeancePayload} members={members} /></>}
        {date > today && current && (
          <div className="mt-2"><ActionButton action={resetBoard.bind(null, date, table)} label="Regenerate automatically" /></div>
        )}
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Preview (reroll {reroll})</h2>
          <Link className="text-sm text-blue-700 hover:underline" href={link({ reroll: reroll + 1 })}>Another board →</Link>
          {reroll > 0 && <Link className="text-sm text-blue-700 hover:underline" href={link({ reroll: 0 })}>Automatic board</Link>}
        </div>
        {built.ok ? (
          <>
            <p className="mb-2 text-xs text-neutral-500">Found after {built.attempts} attempts.</p>
            <Board p={built.payload} members={members} />
            <div className="mt-3">
              <ActionButton
                action={applyBoard.bind(null, date, table, reroll)}
                label={`Use this board for ${date}`}
                confirm={date <= today ? "This day is live. Players who already started this table will see a different board. Continue?" : undefined}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-red-700">No valid board: {built.reason}. The table is sealed for that day.</p>
        )}
      </section>
    </div>
  );
}
