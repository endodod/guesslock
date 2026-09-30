// Guessable entities for autocomplete. Includes new/uncurated heroes (guessable, not answers).
import { unstable_cache } from "next/cache";
import { loadGameData } from "./context";
import type { Catalog, CatalogEntry } from "./types";
import type { GuessKind } from "@/locks.config";

export async function buildCatalog(): Promise<Catalog> {
  const data = await loadGameData();
  return {
    hero: data.heroes.map((h) => ({ id: String(h.id), name: h.name, icon: h.icon, aliases: h.aliases })),
    ability: data.abilities.map((a) => ({
      id: String(a.id), name: a.name, icon: a.icon, group: data.hero(a.heroId)?.name, aliases: a.aliases,
    })),
    item: data.items.map((i) => ({ id: String(i.id), name: i.name, icon: i.image, slot: i.src.slot, aliases: i.aliases })),
  };
}

export const getCatalog = unstable_cache(buildCatalog, ["catalog"], { revalidate: 600, tags: ["catalog"] });

export function lookupFor(catalog: Catalog, kind: GuessKind) {
  if (kind === "number" || kind === "omen" || kind === "seance") return () => undefined;
  const map = new Map<string, CatalogEntry>(catalog[kind].map((e) => [e.id, e]));
  return (id: string) => map.get(id);
}
