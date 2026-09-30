// Accent-insensitive normalization shared by search, guess matching and leak detection.

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fuzzy score of `query` against `target` (higher is better, 0 = no match).
 * Prefix > word-prefix > substring > subsequence with a small typo allowance.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(20, t.length - q.length);
  if (t.split(" ").some((w) => w.startsWith(q))) return 70;
  const qc = q.replace(/ /g, "");
  const tc = t.replace(/ /g, "");
  if (tc.includes(qc)) return 55;
  // subsequence
  let i = 0;
  for (const ch of tc) if (ch === qc[i]) i++;
  if (i === qc.length) return 35;
  // one-typo tolerance for queries of 4+ chars
  if (qc.length >= 4 && editDistanceWithin(qc, tc.slice(0, qc.length + 1), 1)) return 25;
  return 0;
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  // allow b to be a prefix-ish window
  return Math.min(...dp[a.length]) <= max;
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
