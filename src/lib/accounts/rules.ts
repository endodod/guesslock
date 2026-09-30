// Pure account rules (unit-tested): guess merging, ranking eligibility, streaks, display names.

export type MergeResult = {
  guesses: string[];
  /** Guesses newly added by this request. */
  added: number;
  /** The client's list diverged from the stored one; the stored list wins. */
  conflict: boolean;
};

/**
 * Server-side guesses are append-only. The client may be behind (another device played on)
 * or ahead (it just made a guess); a diverging list is rejected in favor of the stored one.
 */
export function mergeGuesses(stored: string[], incoming: string[]): MergeResult {
  const prefix = (a: string[], b: string[]) => a.length <= b.length && a.every((g, i) => g === b[i]);
  if (prefix(stored, incoming)) return { guesses: incoming, added: incoming.length - stored.length, conflict: false };
  if (prefix(incoming, stored)) return { guesses: stored, added: 0, conflict: false };
  return { guesses: stored, added: 0, conflict: true };
}

/**
 * A play counts for leaderboards only if every guess reached the server one at a time
 * while signed in. Adding several guesses in one request (e.g. playing signed out first,
 * then signing in) turns it into an unranked "import".
 */
export function nextSource(current: "live" | "import" | undefined, added: number): "live" | "import" {
  if (current === "import") return "import";
  return added > 1 ? "import" : "live";
}

/** Current and best streak of consecutive days. The current streak may end today or yesterday. */
export function streakFromDays(days: string[], today: string): { current: number; best: number; count: number } {
  const set = [...new Set(days)].sort();
  const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  let best = 0, run = 0;
  let prev: string | null = null;
  for (const d of set) {
    run = prev && shift(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const has = new Set(set);
  let current = 0;
  let cursor = has.has(today) ? today : shift(today, -1);
  while (has.has(cursor)) {
    current++;
    cursor = shift(cursor, -1);
  }
  return { current, best, count: set.length };
}

export const NAME_MIN = 3;
export const NAME_MAX = 20;

/** Returns an error message, or null if the display name is acceptable. */
export function validateDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Use ${NAME_MIN}–${NAME_MAX} characters.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name)) return "Letters, numbers, spaces, dots, dashes and underscores only.";
  if (/\s{2,}/.test(name)) return "No double spaces.";
  if (/^(admin|guesslock|valve|moderator)$/i.test(name.replace(/[\s_.-]/g, ""))) return "That name is reserved.";
  return null;
}

export function nameKey(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

/** Monday (Europe/Zurich puzzle days are plain dates) of the week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
