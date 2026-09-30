// Puzzle-day helpers. A "day" is a YYYY-MM-DD string in the configured timezone (default Europe/Zurich).

const DEFAULT_TZ = "Europe/Zurich";

export function dayInZone(date: Date, tz: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return parts; // en-CA yields YYYY-MM-DD
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which `day` (00:00 local) begins in `tz`. */
export function startOfDay(day: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  let t = guess.getTime() - tzOffsetMs(guess, tz);
  t = guess.getTime() - tzOffsetMs(new Date(t), tz); // second pass handles DST edges
  return new Date(t);
}

export function nextResetAt(now: Date, tz: string = DEFAULT_TZ): Date {
  return startOfDay(addDays(dayInZone(now, tz), 1), tz);
}

/** Puzzle number shown in share text: day 1 is the launch date. */
export function puzzleNumber(day: string, launchDate: string): number {
  return Math.max(1, daysBetween(launchDate, day) + 1);
}
