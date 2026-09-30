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
  sessionSecret: env("SESSION_SECRET", ""),
  cronSecret: process.env.CRON_SECRET ?? "",
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
  /** Street Brawl legendaries are tier 5 in the API (cost 9999). */
  excludedItemTiers: env("EXCLUDED_ITEM_TIERS", "5").split(",").map(Number),
};
