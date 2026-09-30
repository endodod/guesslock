// Automatic redaction pass for Lore, Ability Description, Upgrade Guesser and The Echo.
// Output is reviewed in /admin before a text becomes eligible.

export const CENSOR = "▇▇▇";

export type RedactTerm = {
  term: string;
  /** Replacement; defaults to the censor bar. */
  replacement?: string;
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace every term (case/accent-insensitive, whole word, incl. possessive 's) with its replacement.
 * Longer terms are applied first so "Mo & Krill" wins over "Krill".
 */
export function redact(text: string, terms: RedactTerm[]): { text: string; hits: string[] } {
  const hits: string[] = [];
  const sorted = [...terms]
    .filter((t) => t.term && t.term.trim().length >= 2)
    .sort((a, b) => b.term.length - a.term.length);
  let out = text;
  for (const t of sorted) {
    const pattern = accentFlexible(escapeRegex(t.term.trim()));
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?:['’]s)?(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, () => {
      hits.push(t.term);
      return t.replacement ?? CENSOR;
    });
  }
  return { text: out, hits };
}

/** Let unaccented letters in a pattern match their accented forms. */
function accentFlexible(pattern: string): string {
  const map: Record<string, string> = {
    a: "[aàáâäãå]", e: "[eèéêë]", i: "[iìíîï]", o: "[oòóôöõ]", u: "[uùúûü]", c: "[cç]", n: "[nñ]",
  };
  return pattern.replace(/[aeioucn]/gi, (ch) => map[ch.toLowerCase()] ?? ch);
}

/** True if any term appears in text (used by the leak validator and tests). */
export function findLeaks(text: string, terms: string[]): string[] {
  const { hits } = redact(text, terms.map((term) => ({ term })));
  return [...new Set(hits)];
}
