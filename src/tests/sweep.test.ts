import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientIpFrom, rateLimit } from "@/lib/server/ratelimit";
import { config } from "@/lib/config";
import { inviteToken, parseInvite } from "@/lib/market/earn";

const h = (o: Record<string, string>) => new Headers(o);

describe("client address behind proxies", () => {
  it("takes the entry the trusted proxy appended, so a client can't pick its own address", () => {
    // One trusted proxy (Vercel, a load balancer): the last entry is the address it saw; what the client sent comes first.
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    // Two proxies (a CDN in front of the load balancer).
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
    // Fewer entries than hops: the leftmost there is.
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, ignores forwarding headers with no proxy and never throws", () => {
    expect(clientIpFrom(h({ "x-real-ip": "198.51.100.4" }), 1)).toBe("198.51.100.4");
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6" }), 0)).toBe("unknown");
    expect(clientIpFrom(h({}), 1)).toBe("unknown");
    expect(clientIpFrom(h({ "x-forwarded-for": "x".repeat(500) }), 1).length).toBeLessThanOrEqual(64);
  });
});

describe("rate limit", () => {
  it("allows the limit, then refuses until the window passes", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const over = rateLimit(key, 3, 60_000);
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
    expect(rateLimit(`${key}:other`, 3, 60_000).ok).toBe(true);
  });
});

describe("invite links are not signed with the public puzzle salt", () => {
  it("a signature made with PUZZLE_SALT does not verify", () => {
    const id = "3f2b6a3e-aaaa-4bbb-8ccc-0123456789ab";
    const forged = `${Buffer.from(id).toString("base64url")}.${createHmac("sha256", `${config.salt}:invite`).update(id).digest("base64url").slice(0, 16)}`;
    const was = config.sessionSecret;
    config.sessionSecret = "a-deployment-secret-of-some-length-0123456789";
    try {
      expect(parseInvite(forged)).toBeNull();
      expect(parseInvite(inviteToken(id))).toBe(id);
    } finally { config.sessionSecret = was; }
    expect(parseInvite(inviteToken(id))).toBe(id);
  });
});
