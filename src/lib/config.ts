// Server-side configuration. Everything tunable lives here, read from env with sane defaults.

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  timezone: env("PUZZLE_TIMEZONE", "Europe/Zurich"),
  salt: env("PUZZLE_SALT", "guesslock-v1"),
  launchDate: env("LAUNCH_DATE", "2026-10-01"),
  siteUrl: env("SITE_URL", "guesslock.paulkuehn.ch"),
  apiBase: env("DEADLOCK_API_BASE", "https://api.deadlock-api.com"),
  wikiApi: env("WIKI_API", "https://deadlock.wiki/api.php"),
  wikiUserAgent: env("WIKI_USER_AGENT", "GuesslockBot/1.0 (https://guesslock.paulkuehn.ch; fan project)"),
  generateDaysAhead: Number(env("GENERATE_DAYS_AHEAD", "7")),
  maxNoRepeatDays: Number(env("MAX_NO_REPEAT_DAYS", "60")),
  // Whose Build analytics window
  analyticsDays: Number(env("ANALYTICS_DAYS", "21")),
  analyticsMinBadge: Number(env("ANALYTICS_MIN_BADGE", "70")),
  analyticsMinHeroMatches: Number(env("ANALYTICS_MIN_HERO_MATCHES", "500")),
  analyticsMinPickRate: Number(env("ANALYTICS_MIN_PICK_RATE", "0.04")),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  /** Enables /admin/setup: per-hero, per-puzzle setup editing (ADMIN_SETUP_MODE=1). */
  adminSetup: ["1", "true", "on", "yes"].includes((process.env.ADMIN_SETUP_MODE ?? "").toLowerCase()),
  /** Shows an "Admin login" shortcut under the sign-in form (ADMIN_DEBUG=1, local use). */
  adminDebug: ["1", "true", "on", "yes"].includes((process.env.ADMIN_DEBUG ?? "").toLowerCase()),
  sessionSecret: env("SESSION_SECRET", ""),
  cronSecret: process.env.CRON_SECRET ?? "",
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
  /** Optional deadlock-api key (X-API-KEY): raises replay query limits from 20/h to 200/h. */
  apiKey: process.env.DEADLOCK_API_KEY ?? "",
  /** Replay (demo) query budget per hour; keep below the API limit for this IP/key. */
  omenQueriesPerHour: Number(env("OMEN_QUERIES_PER_HOUR", process.env.DEADLOCK_API_KEY ? "150" : "18")),
  /** Compressed match timelines are kept this long (admin inspector), then pruned. */
  omenTimelineDays: Number(env("OMEN_TIMELINE_DAYS", "14")),
  /** External replay viewer shown after an Omen reveal; {id} = match ID. */
  omenMatchUrl: env("OMEN_MATCH_URL", "https://statlocker.gg/match/{id}"),
  /** Stored API responses older than this aren't used as an outage fallback (see snapshots.ts). */
  apiBackupMaxDays: Number(env("API_BACKUP_MAX_DAYS", "14")),
  /** Street Brawl legendaries are tier 5 in the API (cost 9999). */
  excludedItemTiers: env("EXCLUDED_ITEM_TIERS", "5").split(",").map(Number),
};
