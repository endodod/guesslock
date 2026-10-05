// The Codex: every hero or item a lock could be about, by picture and name only (nothing that narrows the answer down:
// no stats, tiers, costs, release dates or search keywords).
import type { LockDef } from "@/locks.config";
import type { Catalog } from "./engine/types";

export type CodexEntry = { id: string; name: string; icon: string | null; slot?: string };
export type Codex = { kind: "hero" | "item"; entries: CodexEntry[] };

/** Locks whose clue *is* the picture: the Codex would show the answer's image next to it. */
const PICTURE_LOCKS = new Set(["visage", "shadow", "relic"]);

/** Which list a lock's Codex shows, or null for none. */
export function codexKind(lock: LockDef): Codex["kind"] | null {
  if (PICTURE_LOCKS.has(lock.hardOf ?? lock.slug)) return null;
  if (lock.guess === "hero" || lock.guess === "ability" || lock.guess === "grid") return "hero";
  if (lock.guess === "item") return "item";
  return null;
}

export function codexFor(lock: LockDef, catalog: Catalog): Codex | undefined {
  const kind = codexKind(lock);
  if (!kind) return undefined;
  const entries = catalog[kind]
    .map((e) => ({ id: e.id, name: e.name, icon: e.icon, ...(kind === "item" && e.slot ? { slot: e.slot } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { kind, entries };
}
