// Hand-written groups ("curated"): a table of tags per entity, reviewed once, turned into categories.
// Completeness rule: an entity that is not in `reviewed` is "unknown" for every curated group (it appears
// in the admin review queue); an entity that is reviewed and lacks a tag is a clear "no".
import type { SeanceEntity } from "@/locks.config";
import type { DerivedCategory } from "./derive";
import type { CategoryType } from "./types";

export type TagDef = {
  /** Stable id inside its table (part of the category key). */
  tag: string;
  label: string;
  explanation: string;
  difficulty: number;
  /** Entity keys (hero name, item or ability class name) that have the tag. */
  members: readonly string[];
};

export function fromTags(
  entity: SeanceEntity,
  type: CategoryType,
  defs: readonly TagDef[],
  /** Every entity in play with its stable key. */
  universe: readonly { id: number; key: string }[],
  /** Keys that were looked at when the table was written. */
  reviewed: ReadonlySet<string>,
  source: "curated" | "derived" = "curated",
): DerivedCategory[] {
  return defs.map((d) => {
    const have = new Set(d.members);
    return {
      key: `${entity}:${type}:${d.tag}`, entity, type, label: d.label, explanation: d.explanation, source, difficulty: d.difficulty, vetted: true,
      members: new Map(universe.map((u) => [u.id, reviewed.has(u.key) ? have.has(u.key) : null])),
    };
  });
}

/** Keys used in a table that are not in the universe (typos): reported by the tests. */
export function unknownKeys(defs: readonly TagDef[], known: ReadonlySet<string>): string[] {
  return [...new Set(defs.flatMap((d) => d.members).filter((k) => !known.has(k)))];
}
