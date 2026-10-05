// Community puzzles, this device's side: the entries of every puzzle played (puzzle id -> entries). Never worth souls.
const KEY = "guesslock:community";
const MAX = 200;

function load(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function loadCommunityEntries(id: string): string[] {
  const e = load()[id];
  return Array.isArray(e) ? e.filter((x) => typeof x === "string") : [];
}

export function saveCommunityEntries(id: string, entries: string[]) {
  try {
    const all = load();
    delete all[id];
    all[id] = entries;
    // Keep the most recent puzzles only.
    const ids = Object.keys(all);
    for (const old of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[old];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage blocked: the puzzle still plays */ }
}
