"use client";
// Admin scenario inspector: scrub [T-10 s, T+W] on the map and see the raw events and answer.
import { useState } from "react";
import type { OmenPayload } from "@/lib/omens/types";
import type { OmenMapMeta } from "@/lib/omens/map";
import { OmenMap, type MapHero, type MapMarker } from "@/components/omens/OmenMap";

type Track = { pos: [number, number][]; hp: number[]; maxHp: number[] };

export function OmenInspector({
  payload, before, heroes, map,
}: { payload: OmenPayload; before: Track[] | null; heroes: Record<number, { name: string; icon: string | null }>; map: OmenMapMeta }) {
  const s = payload.snapshot, w = payload.window;
  const from = before ? -10 : 0;
  const [rel, setRel] = useState(0);
  const at = (k: number): { pos: [number, number]; hp: number; maxHp: number } => {
    if (rel < 0 && before) {
      const i = 10 + rel;
      return { pos: before[k].pos[i], hp: before[k].hp[i], maxHp: before[k].maxHp[i] };
    }
    const tr = w.tracks[k];
    const i = Math.min(rel, tr.pos.length - 1);
    return { pos: tr.pos[i], hp: tr.hp[i], maxHp: tr.maxHp[i] };
  };
  const mapHeroes: MapHero[] = s.heroes.map((h) => {
    const f = at(h.key);
    return { key: h.key, team: h.team, icon: heroes[h.heroId]?.icon ?? null, label: heroes[h.heroId]?.name ?? "", pos: f.pos, trail: [], hp: f.hp, maxHp: f.maxHp, alive: f.hp > 0, respawnIn: 0 };
  });
  const markers: MapMarker[] = w.events
    .filter((e) => e.type === "death" && e.t - s.t <= rel && e.t - s.t >= 0)
    .map((e, i) => ({ id: `d${i}`, kind: "death" as const, pos: (e as { pos: [number, number] }).pos, age: rel - (e.t - s.t) }));
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="rounded bg-neutral-900 p-2">
        <OmenMap
          image={map.image} objectivePositions={map.objectives} objectives={s.objectives} heroes={mapHeroes}
          midboss={{ alive: s.midboss.alive }} markers={markers} riftPos={rel >= 0 ? w.riftPos : null} focus={[0.5, 0.5]}
        />
        <div className="mt-2 flex items-center gap-3 text-sm text-neutral-200">
          <input type="range" min={from} max={s.window} value={rel} onChange={(e) => setRel(Number(e.target.value))} className="flex-1" aria-label="Time" />
          <span className="w-28 font-mono">{clock(s.t + rel)} ({rel >= 0 ? "+" : ""}{rel}s)</span>
        </div>
        {!before && <p className="mt-1 text-xs text-neutral-400">Match timeline pruned: only [T, T+W] is available.</p>}
      </div>
      <div className="space-y-3 text-sm">
        <div><h2 className="font-semibold">Answer</h2><pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs">{JSON.stringify(payload.answer, null, 1)}</pre></div>
        <div>
          <h2 className="font-semibold">Events ({w.events.length})</h2>
          <ul className="font-mono text-xs">
            {w.events.map((e, i) => <li key={i}>{clock(e.t)} {e.type} {JSON.stringify({ ...e, t: undefined, type: undefined })}</li>)}
          </ul>
        </div>
        <details><summary className="cursor-pointer font-semibold">Snapshot JSON</summary><pre className="max-h-96 overflow-auto rounded bg-neutral-100 p-2 text-xs">{JSON.stringify(s, null, 1)}</pre></details>
      </div>
    </div>
  );
}
