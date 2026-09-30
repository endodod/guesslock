// Local player data (localStorage). Keyed by date and lock *slug* — never by numeral —
// so renumbering locks can't corrupt saved progress. Pure helpers are unit-tested.
import { LEGACY_11_NUMERALS, LOCKS } from "@/locks.config";

export type LockRecord = {
  g: string[]; // guesses (ids or numbers as strings)
  b?: string; // bonus pick
  gu?: boolean; // gave up
  o?: unknown; // The Omens: the locked-in answers (the record's souls = the Omen score)
  s: "playing" | "won" | "lost";
  w: number; // wrong guesses
  h: number; // hints used
  souls: number;
  bonusCorrect?: boolean;
  archive?: boolean; // replay of a past day: excluded from stats and streaks
  answer?: { name: string; image: string | null };
  at?: number; // finished at (ms)
};

export type Settings = {
  colorblind: boolean;
  motion: "auto" | "reduced" | "full";
  sound: boolean;
  grayscale: boolean;
  rotation: boolean;
  noHints: boolean;
  colorEmoji: boolean;
};

export type StoreData = {
  version: 2;
  progress: Record<string, Record<string, LockRecord>>; // date -> slug -> record
  settings: Settings;
  onboarded: boolean;
  /** Omen practice (never counts toward souls/streaks): per Omen, rounds played and souls scored. */
  practice: Record<string, { n: number; souls: number }>;
};

export const DEFAULT_SETTINGS: Settings = {
  colorblind: false, motion: "auto", sound: false, grayscale: false, rotation: false, noHints: false, colorEmoji: false,
};

export const STORE_KEY = "guesslock";

export function emptyStore(): StoreData {
  return { version: 2, progress: {}, settings: { ...DEFAULT_SETTINGS }, onboarded: false, practice: {} };
}

/**
 * Migrates any stored shape to the current one.
 * v1 (11-lock era) keyed progress by Roman numeral; v2 keys by slug.
 */
export function migrateStore(raw: unknown): StoreData {
  if (!raw || typeof raw !== "object") return emptyStore();
  const r = raw as Record<string, unknown>;
  const out = emptyStore();
  out.onboarded = !!r.onboarded;
  out.settings = { ...DEFAULT_SETTINGS, ...((r.settings as Partial<Settings>) ?? {}) };
  if (r.practice && typeof r.practice === "object") out.practice = r.practice as StoreData["practice"];
  const progress = (r.progress ?? {}) as Record<string, Record<string, LockRecord>>;
  const validSlugs = new Set(LOCKS.map((l) => l.slug));
  for (const [date, locks] of Object.entries(progress)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !locks || typeof locks !== "object") continue;
    for (const [key, rec] of Object.entries(locks)) {
      const slug = r.version === 2 ? key : (LEGACY_11_NUMERALS[key] ?? key);
      if (!validSlugs.has(slug) || !rec || !Array.isArray(rec.g)) continue;
      (out.progress[date] ??= {})[slug] = rec;
    }
  }
  return out;
}

export function loadStore(): StoreData {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? migrateStore(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(data: StoreData) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("guesslock:store"));
  } catch {
    /* storage full or blocked: play continues without persistence */
  }
}

// ───────────── stats ─────────────

const live = (r?: LockRecord) => !!r && !r.archive;

export function isDayUnlocked(day: Record<string, LockRecord> | undefined): boolean {
  return !!day && Object.values(day).some((r) => live(r) && r.s === "won");
}

/** Streak of consecutive days ending today (or yesterday, if today isn't unlocked yet). */
export function streaks(progress: StoreData["progress"], today: string, pred: (d: string) => boolean = (d) => isDayUnlocked(progress[d])) {
  const days = Object.keys(progress).filter(pred).sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const d of days) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  let cursor = pred(today) ? today : shiftDay(today, -1);
  while (pred(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  return { current, best, days: days.length };
}

export function lockStats(progress: StoreData["progress"], slug: string, today: string) {
  let played = 0, wins = 0, guessSum = 0;
  const dist: Record<string, number> = {};
  for (const day of Object.values(progress)) {
    const r = day[slug];
    if (!live(r) || r.s === "playing") continue;
    played++;
    if (r.s === "won") {
      wins++;
      guessSum += r.g.length;
      const k = r.g.length >= 10 ? "10+" : String(r.g.length);
      dist[k] = (dist[k] ?? 0) + 1;
    } else dist["X"] = (dist["X"] ?? 0) + 1;
  }
  const st = streaks(progress, today, (d) => live(progress[d]?.[slug]) && progress[d][slug].s === "won");
  return {
    played, wins,
    winRate: played ? Math.round((wins / played) * 100) : 0,
    avgGuesses: wins ? Math.round((guessSum / wins) * 10) / 10 : 0,
    dist, streak: st.current, bestStreak: st.best,
  };
}

export function daySouls(day: Record<string, LockRecord> | undefined): number {
  return day ? Object.values(day).filter(live).reduce((a, r) => a + (r.souls ?? 0), 0) : 0;
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function shiftDay(d: string, n: number) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
