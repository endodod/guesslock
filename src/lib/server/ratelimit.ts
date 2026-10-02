// Best-effort rate limiting for public endpoints: in memory per server instance (resets on deploy or scale-out),
// so it is a speed bump against scripted abuse, not the only defence.
import { config } from "../config";

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

/**
 * The caller's address from forwarding headers. X-Forwarded-For is a list the client can start with anything, and every proxy
 * appends the address it saw, so only the entries from the right (as many as TRUSTED_PROXY_HOPS) are trustworthy: the first
 * hop would let anyone dodge a limit by sending a different fake address each time.
 */
export function clientIpFrom(headers: Pick<Headers, "get">, hops = config.trustedProxyHops): string {
  if (hops > 0) {
    const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (chain.length) return chain[Math.max(0, chain.length - hops)].slice(0, 64);
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  }
  return "unknown";
}
export const clientIp = (req: Request) => clientIpFrom(req.headers);

export function tooMany(retryAfter: number): Response {
  return Response.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } });
}
