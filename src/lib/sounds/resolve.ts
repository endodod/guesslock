// deadlock-api's sound index (GET /v1/assets/sounds): a nested folder tree whose leaves are CDN URLs.
// Pure helpers (unit-tested): flatten the tree and map hero codenames to their ability/weapon folders.
// See docs/resonance-data-spike.md for the data findings behind these rules.

/** Nested folders; leaves are public CDN URLs (…/sounds/abilities/haze/haze_smoke_bomb_cast.mp3). */
export type SoundTree = { [name: string]: SoundTree | string };

/** One clip: `path` is the index path without extension, e.g. "abilities/haze/haze_smoke_bomb_cast". */
export type IndexedClip = { path: string; url: string };

export type FolderKind = "abilities" | "weapons";

export function flattenTree(tree: SoundTree | string | undefined, prefix: string): IndexedClip[] {
  if (tree === undefined) return [];
  if (typeof tree === "string") return /^https?:\/\//.test(tree) ? [{ path: prefix, url: tree }] : [];
  return Object.entries(tree).flatMap(([k, v]) => flattenTree(v, prefix ? `${prefix}/${k}` : k));
}

/** All clips of one top-level folder, e.g. clipsOf(tree, "abilities", "haze"). */
export function clipsOf(tree: SoundTree, kind: FolderKind, folder: string): IndexedClip[] {
  const top = tree[kind];
  if (!top || typeof top === "string") return [];
  return flattenTree(top[folder], `${kind}/${folder}`);
}

export function folderNames(tree: SoundTree, kind: FolderKind): string[] {
  const top = tree[kind];
  return top && typeof top !== "string" ? Object.keys(top).sort() : [];
}

/** Folders that hold sounds for every hero (never a clue: they don't point to one hero). */
export const SHARED_FOLDERS = new Set(["shared", "common", "generic"]);

const NAME_STOP = new Set(["the", "and", "lady", "grey", "mister", "doctor"]);

/** "hero_atlas" -> "atlas". */
export function codenameOf(className: string): string {
  return className.replace(/^hero_/, "").toLowerCase();
}

/**
 * Folder names that may belong to a hero, best first: the codename from its class_name, its display
 * name squashed ("Mo & Krill" -> "mokrill"), and single words of the name ("Lady Geist" -> "geist").
 */
export function heroFolderKeys(h: { className: string; name: string }): { key: string; how: "exact" | "alias" }[] {
  const out: { key: string; how: "exact" | "alias" }[] = [{ key: codenameOf(h.className), how: "exact" }];
  const words = h.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const squashed = words.join("");
  if (squashed) out.push({ key: squashed, how: "alias" });
  for (const w of words) if (w.length >= 4 && !NAME_STOP.has(w)) out.push({ key: w, how: "alias" });
  const seen = new Set<string>();
  return out.filter((k) => (seen.has(k.key) ? false : (seen.add(k.key), true)));
}

export type FolderMatch = { folder: string; how: "exact" | "alias" };
export type HeroFolders = { heroId: number; abilities: FolderMatch[]; weapons: FolderMatch[] };

/**
 * Resolve every active hero's ability and weapon folders. A hero can have several folders (Lady Geist
 * has both `ghost` and `geist`). Exact codename matches win over name aliases, and a folder is never
 * given to two heroes. Folders no active hero claims (unreleased/test heroes) are returned separately.
 */
export function resolveHeroFolders(
  heroes: { id: number; className: string; name: string }[],
  tree: SoundTree,
): { heroes: HeroFolders[]; unclaimed: Record<FolderKind, string[]> } {
  const result = new Map<number, HeroFolders>(heroes.map((h) => [h.id, { heroId: h.id, abilities: [], weapons: [] }]));
  const unclaimed = {} as Record<FolderKind, string[]>;
  for (const kind of ["abilities", "weapons"] as const) {
    const available = new Set(folderNames(tree, kind).filter((f) => !SHARED_FOLDERS.has(f)));
    const claimed = new Map<string, { heroId: number; how: "exact" | "alias" }>();
    // Two passes so an exact codename always beats another hero's name alias.
    for (const pass of ["exact", "alias"] as const)
      for (const h of heroes)
        for (const k of heroFolderKeys(h))
          if (k.how === pass && available.has(k.key) && !claimed.has(k.key)) claimed.set(k.key, { heroId: h.id, how: k.how });
    for (const [folder, c] of [...claimed.entries()].sort(([a], [b]) => a.localeCompare(b)))
      result.get(c.heroId)![kind].push({ folder, how: c.how });
    unclaimed[kind] = [...available].filter((f) => !claimed.has(f));
  }
  return { heroes: [...result.values()], unclaimed };
}
