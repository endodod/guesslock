"use client";
// Yes/no/unknown toggles for every active hero. Visuals show portraits; lore shows the lore on hover.
import { useState, useTransition } from "react";
import { setMembership } from "../actions";

type Hero = { id: number; name: string; image: string | null; lore: string | null };
type Value = { member: boolean; source: string };

export function MembershipGrid({ categoryId, type, heroes, values }: {
  categoryId: number; type: string; heroes: Hero[]; values: Record<number, Value>;
}) {
  const [local, setLocal] = useState<Record<number, Value | null>>({});
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const current = (id: number): Value | null => (id in local ? local[id] : values[id] ?? null);

  const cycle = (id: number) => {
    const v = current(id);
    const next = v === null ? true : v.member ? false : null;
    setLocal((l) => ({ ...l, [id]: next === null ? null : { member: next, source: "admin" } }));
    start(async () => {
      try { await setMembership(categoryId, id, next); setErr(null); } catch (e) { setErr((e as Error).message); }
    });
  };

  const portraits = type === "visuals";
  return (
    <div>
      {err && <p className="mb-2 text-sm text-red-700">{err}</p>}
      <ul className={`grid gap-1.5 ${portraits ? "grid-cols-3 sm:grid-cols-6 lg:grid-cols-8" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6"}`}>
        {heroes.map((h) => {
          const v = current(h.id);
          const cls = v === null ? "border-amber-400 bg-amber-50" : v.member ? "border-green-600 bg-green-50" : "border-neutral-300 bg-white";
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => cycle(h.id)}
                title={type === "lore" && h.lore ? h.lore : undefined}
                className={`flex w-full items-center gap-2 rounded border p-1 text-left text-sm ${cls} ${portraits ? "flex-col" : ""}`}
              >
                {portraits && h.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image} alt="" className="aspect-square w-full rounded object-cover object-top" />
                )}
                <span className="flex-1 truncate">{h.name}</span>
                <span className={`text-xs font-semibold ${v === null ? "text-amber-700" : v.member ? "text-green-800" : "text-neutral-500"}`}>
                  {v === null ? "?" : v.member ? "yes" : "no"}
                  {v && v.source !== "admin" ? <span className="ml-0.5 font-normal text-neutral-400">({v.source})</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {pending && <p className="mt-1 text-xs text-neutral-500">Saving…</p>}
    </div>
  );
}
