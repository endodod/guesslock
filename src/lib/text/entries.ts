// Stored texts for the text modes. Source text comes from the API; players only ever see
// finalText of approved/rewritten entries.
import { createHash } from "node:crypto";
import { db } from "../db";
import { redact, type RedactTerm } from "./redact";

export type TextEntityType = "hero_lore" | "ability_desc" | "ability_t1" | "ability_t2" | "ability_t3";

export function sha(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/** Terms that give away a hero: name, aliases, internal codename, and their ability names. */
export function heroTerms(hero: { name: string; className: string; aliases?: string[] }, abilityNames: string[]): RedactTerm[] {
  const code = hero.className.replace(/^hero_/, "");
  const terms: RedactTerm[] = [
    { term: hero.name },
    ...(hero.aliases ?? []).map((term) => ({ term })),
    ...abilityNames.map((term) => ({ term })),
  ];
  if (code.length >= 4 && code.toLowerCase() !== hero.name.toLowerCase()) terms.push({ term: code });
  // Multi-part names ("Lady Geist", "Grey Talon", "The Doorman"): also redact the distinctive part.
  const words = hero.name.split(/\s+|&/).map((p) => p.trim()).filter(Boolean);
  if (words.length > 1)
    terms.push(...words.filter((p) => p.length >= 4 && !/^(the|lady|grey)$/i.test(p)).map((term) => ({ term })));
  return terms;
}

/**
 * Create/update the entry for a rendered source text. If an approved entry's source changes,
 * it is flagged as stale instead of being overwritten.
 */
export async function upsertTextEntry(entityType: TextEntityType, entityId: number, sourceText: string, terms: RedactTerm[]) {
  const sourceHash = sha(sourceText);
  const autoText = redact(sourceText, terms).text;
  const existing = await db.textEntry.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
  if (!existing) {
    await db.textEntry.create({ data: { entityType, entityId, sourceText, sourceHash, autoText, status: "auto" } });
    return "created" as const;
  }
  if (existing.sourceHash === sourceHash) {
    // Terms (e.g. new aliases) may have changed: refresh autoText for unreviewed entries only.
    if (existing.status === "auto" && existing.autoText !== autoText)
      await db.textEntry.update({ where: { id: existing.id }, data: { autoText } });
    return "unchanged" as const;
  }
  await db.textEntry.update({
    where: { id: existing.id },
    data: {
      sourceText, sourceHash, autoText,
      stale: existing.status !== "auto",
    },
  });
  return "changed" as const;
}

/**
 * Display text for a puzzle. No admin approval needed: the automatic redaction is used directly;
 * an admin rewrite (finalText) takes precedence when one exists and its source hasn't changed since.
 */
export function usableText(e: { status: string; stale: boolean; finalText: string | null; autoText: string } | null | undefined): string | null {
  if (!e) return null;
  const text = e.finalText && !e.stale ? e.finalText : e.autoText;
  return text.trim() || null;
}
