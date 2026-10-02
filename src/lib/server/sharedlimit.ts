// Rate limits that hold across server instances: one counter row per key in Postgres, updated atomically.
//
// For the low-volume, sensitive paths (admin login, the agent API's failed attempts, market writes, account export and sync).
// Hot paths (/api/play, /api/endless, /api/omen) keep the in-memory limiter in ratelimit.ts: a database round trip per guess
// would cost more than the abuse it stops.
//
// If the database can't be reached (or the table doesn't exist yet) the check falls back to the in-memory limiter, so an
// outage never locks players out and a limit is never *less* strict than before.
import { db } from "../db";
import { rateLimit } from "./ratelimit";

export type Limit = { ok: boolean; retryAfter: number };

/**
 * Counts one hit for `key` in the shared store; ok = within `limit` hits per `windowMs`. A single INSERT ... ON CONFLICT, so
 * parallel requests on different instances can't both read the same count. The window starts at the first hit and the counter
 * restarts once it has passed.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<Limit> {
  if (!process.env.DATABASE_URL) return rateLimit(key, limit, windowMs); // no database configured (tests, scripts)
  try {
    const rows = await db.$queryRaw<{ count: number; retry: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + (${windowMs}::double precision * interval '1 millisecond'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())))::int AS "retry"`;
    const r = rows[0];
    if (!r) return rateLimit(key, limit, windowMs);
    return { ok: r.count <= limit, retryAfter: Math.max(1, r.retry) };
  } catch (e) {
    console.error("[ratelimit] shared store unavailable, using this instance's counter", String(e).split("\n")[0]);
    return rateLimit(key, limit, windowMs);
  }
}

/** Whether `key` is already over `limit` in its current window, without counting a hit (e.g. before comparing a secret). */
export async function overLimit(key: string, limit: number): Promise<Limit> {
  if (!process.env.DATABASE_URL) return { ok: true, retryAfter: 0 };
  try {
    const rows = await db.$queryRaw<{ count: number; retry: number }[]>`
      SELECT "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())))::int AS "retry" FROM "RateLimit" WHERE "key" = ${key} AND "resetAt" > now()`;
    const r = rows[0];
    return r && r.count >= limit ? { ok: false, retryAfter: Math.max(1, r.retry) } : { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

/** Deletes counters whose window ended (daily, from the cron job). Returns how many. */
export async function pruneRateLimits(): Promise<number> {
  return db.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < now() - interval '1 hour'`;
}
