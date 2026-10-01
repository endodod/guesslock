// Best-effort rate limiting for public endpoints: in memory per server instance (resets on deploy or scale-out),
// so it is a speed bump against scripted abuse, not the only defence.
type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

/** Counts one hit for `key`; ok = within `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.n++;
  return { ok: b.n <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

/** The caller's address as the platform reports it (first X-Forwarded-For hop on Vercel). */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

export function tooMany(retryAfter: number): Response {
  return Response.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } });
}
