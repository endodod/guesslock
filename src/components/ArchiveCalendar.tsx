"use client";
import Link from "next/link";
import { VAULT_UNITS } from "@/locks.config";
import type { LockRecord } from "@/lib/client/store";
import { useGame } from "./GameProvider";

/** One dot per Vault lock; the Séance box is won once any table is won, jammed when all finished tables were lost. */
function unitRecord(day: Record<string, LockRecord>, u: (typeof VAULT_UNITS)[number]): { key: string; s?: string } {
  if (u.kind === "lock") return { key: u.lock.slug, s: day[u.lock.slug]?.s };
  const recs = u.locks.map((l) => day[l.slug]).filter((r): r is LockRecord => !!r);
  const s = recs.some((r) => r.s === "won") ? "won" : recs.some((r) => r.s === "playing") ? "playing" : recs.length ? "lost" : undefined;
  return { key: "seance", s };
}

export function ArchiveCalendar({ dates }: { dates: string[] }) {
  const { store } = useGame();
  const months = new Map<string, string[]>();
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(d);
  }
  return (
    <div className="space-y-8">
      {[...months.entries()].map(([m, ds]) => (
        <section key={m}>
          <h2 className="smallcaps mb-3 text-brass">
            {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"))}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {ds.map((d) => {
              const day = store.progress[d] ?? {};
              return (
                <li key={d}>
                  <Link href={`/archive/${d}`} className="block rounded-sm border border-brass/25 bg-iron/70 p-2 hover:border-brass" aria-label={`Replay ${d}`}>
                    <div className="font-mono text-sm text-paper">{d.slice(8)}</div>
                    {/* one dot per lock */}
                    <div className="mt-1.5 grid grid-cols-7 gap-1" aria-hidden>
                      {VAULT_UNITS.map((u) => {
                        const r = unitRecord(day, u);
                        const c = !r.s ? "bg-ash/20" : r.s === "won" ? "bg-ecto" : r.s === "lost" ? "bg-[#b0433f]" : "bg-brass/70";
                        return <span key={r.key} className={`h-1.5 w-1.5 rounded-full ${c}`} />;
                      })}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
