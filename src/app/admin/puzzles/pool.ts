// Who can be each lock's answer, and why not: one row per hero, ability or item.
import type { GameData } from "@/lib/engine/context";
import { MODES } from "@/lib/engine/registry";
import { dayIndex } from "@/lib/day";
import type { LockDef } from "@/locks.config";
import { heroStatuses } from "../setup/status";

export type PoolRow = {
  kind: "hero" | "ability" | "item";
  id: string;
  /** Answer id for overrides (Lineage prefixes the day's direction). */
  answerId: string | null;
  name: string;
  sub?: string;
  icon: string | null;
  heroId?: number;
  on: boolean;
  inPool: boolean;
  note: string;
};

export function poolRows(lock: LockDef, data: GameData, date: string): PoolRow[] {
  const mode = lock.mode;
  if (!MODES[mode] || MODES[mode].selfPicked) return [];
  const cands = MODES[mode].candidates(data, { dayIndex: dayIndex(date) });
  const byRef = new Map(cands.map((c) => [String(c.ref), c.answerId]));

  // The Decoy is guessed by item but built per hero.
  const kind = lock.mode === "decoy" ? "hero" : lock.guess;
  if (kind === "ability") {
    return data.abilities.map((a) => {
      const h = data.hero(a.heroId)!;
      const on = !a.exclude.includes(mode) && !h.exclude.includes(mode);
      const answerId = byRef.get(String(a.id)) ?? null;
      return {
        kind: "ability", id: String(a.id), answerId, name: a.name, sub: h.name, icon: a.icon, heroId: h.id, on: !a.exclude.includes(mode),
        inPool: !!answerId, note: !on ? (h.exclude.includes(mode) ? `${h.name} turned off` : "Turned off") : answerId ? "In pool" : "Missing an upgrade text",
      };
    });
  }
  if (kind === "hero") {
    const status = heroStatuses(data);
    return data.heroes.map((h) => {
      const s = status.get(h.id)?.[mode] ?? { on: !h.exclude.includes(mode), inPool: false, note: "Not eligible" };
      return { kind: "hero", id: String(h.id), answerId: byRef.get(String(h.id)) ?? null, name: h.name, icon: h.icon, heroId: h.id, on: s.on, inPool: s.inPool, note: s.note };
    });
  }
  const itemNote: Record<string, string> = {
    "item-picture": "No icon",
    "build-path": "Nothing builds into/from it in today's direction",
    "stat-bonus": "Needs 2+ stats, one of them a clean number",
  };
  return data.items.map((i) => {
    const on = !i.exclude.includes(mode);
    const answerId = byRef.get(String(i.id)) ?? null;
    return {
      kind: "item", id: String(i.id), answerId, name: i.name, sub: `${i.src.slot} · T${i.src.tier}`, icon: i.image, on,
      inPool: !!answerId, note: !on ? "Turned off" : answerId ? "In pool" : itemNote[mode] ?? "Not eligible",
    };
  });
}
