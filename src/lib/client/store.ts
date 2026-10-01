// Local player data (localStorage). Keyed by date and lock *slug* — never by numeral —
// so renumbering locks can't corrupt saved progress. Pure helpers are unit-tested.
import { isSeance, LEGACY_11_NUMERALS, LOCKS, SOUND_LOCK_SLUGS } from "@/locks.config";
import { foldPlays } from "../seance/scoring";

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
  ranked?: boolean; // signed in: counts for leaderboards (set from the server)
  answer?: { name: string; image: string | null };
  at?: number; // finished at (ms)
  tables?: number; // The Séance: tables in play that day (the box is worth their average)
};

export type Settings = {
  colorblind: boolean;
  motion: "auto" | "reduced" | "full";
  sound: boolean;
  grayscale: boolean;
  rotation: boolean;
  noHints: boolean;
  colorEmoji: boolean;
  /** Accessibility: sound locks (The Resonance) are skipped and never counted. */
  skipSound: boolean;
  /** Sound locks volume, 0…1 (separate from the SFX toggle). */
  soundVolume: number;
  /** Hard mode: The Resonance stays muffled until the win. */
  muffledOnly: boolean;
};

export type StoreData = {
  version: 2;
  progress: Record<string, Record<string, LockRecord>>; // date -> slug -> record
  settings: Settings;
  onboarded: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  colorblind: false, motion: "auto", sound: false, grayscale: false, rotation: false, noHints: false, colorEmoji: false,
  skipSound: false, soundVolume: 0.8, muffledOnly: false,
};

/** Slugs to leave out of counts, shares and streaks for these settings. */
export function ignoredSlugs(settings: Pick<Settings, "skipSound">): Set<string> {
  return new Set(settings.skipSound ? SOUND_LOCK_SLUGS : []);
}

export const STORE_KEY = "guesslock";

export function emptyStore(): StoreData {
  return { version: 2, progress: {}, settings: { ...DEFAULT_SETTINGS }, onboarded: false };
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

/**
 * Adopts the account's progress from the server: server records replace local ones for the same
 * day and lock (the server is authoritative when signed in); local-only records are kept.
 */
export function adoptServerProgress(local: StoreData["progress"], server: Record<string, Record<string, LockRecord>>): StoreData["progress"] {
  const out: StoreData["progress"] = {};
  for (const [d, locks] of Object.entries(local)) out[d] = { ...locks };
  for (const [d, locks] of Object.entries(server ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    for (const [slug, rec] of Object.entries(locks ?? {})) {
      if (!rec || !Array.isArray(rec.g)) continue;
      (out[d] ??= {})[slug] = { ...rec, s: rec.s === "won" || rec.s === "lost" ? rec.s : "playing" };
    }
  }
  return out;
}

// ───────────── stats ─────────────

const live = (r?: LockRecord) => !!r && !r.archive;

/** A day counts once any lock is solved; `ignore` = skipped locks (e.g. sound locks) that never count. */
export function isDayUnlocked(day: Record<string, LockRecord> | undefined, ignore: ReadonlySet<string> = new Set()): boolean {
  return !!day && Object.entries(day).some(([slug, r]) => !ignore.has(slug) && live(r) && r.s === "won");
}

/** Day streaks (see `streaks`) with some locks left out. */
export function dayStreaks(progress: StoreData["progress"], today: string, ignore: ReadonlySet<string>) {
  return streaks(progress, today, (d) => isDayUnlocked(progress[d], ignore));
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

/**
 * A day's souls; the Séance tables fold into one box worth their average (see foldPlays).
 * `ignore` = skipped slugs (sound locks); `pred` picks the records that count (default: live plays).
 */
export function daySouls(day: Record<string, LockRecord> | undefined, ignore: ReadonlySet<string> = new Set(), pred: (r: LockRecord) => boolean = live): number {
  if (!day) return 0;
  const entries = Object.entries(day).filter(([slug, r]) => !ignore.has(slug) && pred(r));
  const tables = Math.max(0, ...entries.filter(([slug]) => isSeance(slug)).map(([, r]) => r.tables ?? 4));
  return foldPlays(entries.map(([lock, r]) => ({ date: "d", lock, souls: r.souls ?? 0, status: r.s })), isSeance, () => tables).souls;
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function shiftDay(d: string, n: number) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
