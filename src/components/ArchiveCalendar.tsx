"use client";
import Link from "next/link";
import { LOCKS } from "@/locks.config";
import { useGame } from "./GameProvider";

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
                    {/* 13-dot summary, one per lock */}
                    <div className="mt-1.5 grid grid-cols-7 gap-1" aria-hidden>
                      {LOCKS.map((l) => {
                        const r = day[l.slug];
                        const c = !r ? "bg-ash/20" : r.s === "won" ? "bg-ecto" : r.s === "lost" ? "bg-[#b0433f]" : "bg-brass/70";
                        return <span key={l.slug} className={`h-1.5 w-1.5 rounded-full ${c}`} />;
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
