"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { emptyEndless, loadEndless, type EndlessData } from "@/lib/client/endless";

export function EndlessList({ locks }: { locks: { slug: string; numeral: string; name: string; subtitle: string }[] }) {
  const [d, setD] = useState<EndlessData>(emptyEndless);
  useEffect(() => { void Promise.resolve().then(() => setD(loadEndless())); }, []);
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {locks.map((l) => {
        const s = d.stats[l.slug];
        const inProgress = d.current[l.slug]?.rec?.s === "playing";
        return (
          <li key={l.slug} className="min-w-0">
            <Link href={`/endless/${l.slug}`} className="deco flex h-full min-w-0 items-center gap-3 rounded-[3px] p-3 hover:border-ecto/60">
              <span className="flex h-9 min-w-11 items-center justify-center rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-1.5 font-display text-xs tracking-widest text-[#2a1f08]">{l.numeral}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-paper">{l.name}</span>
                <span className="block truncate text-xs text-ash">{l.subtitle}</span>
              </span>
              <span className="shrink-0 text-right font-mono text-[0.7rem] text-ash">
                {inProgress ? <span className="text-ecto">in progress</span> : s ? <>{s.won}/{s.played}<br />streak {s.streak}</> : "∞"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
