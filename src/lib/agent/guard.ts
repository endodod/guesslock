// Agent API guard: authentication, rate limiting, request parsing and audit trail.
//
// Security model:
//  - Two independent bearer secrets: a READ token (state only) and a WRITE token (also read + edits). Each must be
//    at least 32 characters; a missing or too-short secret switches that access level off. With neither set the whole
//    API answers 404 as if it didn't exist.
//  - Tokens are accepted in the Authorization header only (never in the URL, which ends up in logs).
//  - Comparison is constant-time (SHA-256 digests); failed attempts are throttled per client address and slowed down.
//  - Rate limits per token and failed attempts per address are counted in Postgres, so they hold across server instances
//    (falling back to this instance's memory if the database is unreachable); request bodies are size-capped and parsed
//    with strict schemas; responses are never cached; no CORS headers are sent, so browsers can't call it.
//  - Every write is recorded in the audit log (SyncRun rows of kind "agent-api", visible on /admin).
import { createHash, timingSafeEqual } from "node:crypto";
import type { ZodType } from "zod";
import { config } from "../config";
import { db } from "../db";
import { clientIp } from "../server/ratelimit";
import { overLimit, rateLimitShared } from "../server/sharedlimit";
import type { Prisma } from "@/generated/prisma/client";

export type Scope = "read" | "write";
export type Who = { scope: Scope; id: string };

const MIN_TOKEN = 32;
const MAX_BODY = 200_000;

const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const usable = (t: string) => t.length >= MIN_TOKEN;

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
  });
}
export const fail = (status: number, error: string, extra?: Record<string, unknown>, headers?: Record<string, string>) => json({ error, ...extra }, status, headers);

// ---- throttling ----
// Failed authentications per client address (10 per minute allowed): kept in this instance's memory as well as in the shared
// store, so the limit still holds if the database is down.
type Bucket = { n: number; reset: number };
const fails = new Map<string, Bucket>();
const MAX_FAILS = 10;
async function noteFailure(ip: string) {
  const now = Date.now();
  if (fails.size > 5000) for (const [k, b] of fails) if (b.reset < now) fails.delete(k);
  const f = fails.get(ip);
  if (!f || f.reset < now) fails.set(ip, { n: 1, reset: now + 60_000 });
  else f.n++;
  await rateLimitShared(`agent-fail:${ip}`, MAX_FAILS, 60_000);
}

const clientKey = (req: Request) => clientIp(req);

/** Authenticate a request for a scope. Returns the caller, or the response to send. */
export async function guard(req: Request, scope: Scope): Promise<{ who: Who } | { res: Response }> {
  const readOn = usable(config.agentReadToken), writeOn = usable(config.agentWriteToken);
  if (!readOn && !writeOn) return { res: fail(404, "Not found") }; // feature off: don't advertise it

  // Clients with too many recent failures are rejected before any token is compared.
  const ip = clientKey(req);
  const failed = fails.get(ip);
  if (failed && failed.reset > Date.now() && failed.n >= MAX_FAILS) {
    return { res: fail(429, "Too many failed attempts", {}, { "retry-after": String(Math.ceil((failed.reset - Date.now()) / 1000)) }) };
  }
  const shared = await overLimit(`agent-fail:${ip}`, MAX_FAILS);
  if (!shared.ok) return { res: fail(429, "Too many failed attempts", {}, { "retry-after": String(shared.retryAfter) }) };

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  let who: Who | null = null;
  if (token) {
    if (writeOn && same(token, config.agentWriteToken)) who = { scope: "write", id: "write-token" };
    else if (readOn && same(token, config.agentReadToken)) who = { scope: "read", id: "read-token" };
  }
  if (!who) {
    await noteFailure(ip);
    await new Promise((r) => setTimeout(r, 300)); // slow brute force
    return { res: fail(401, "Missing or invalid token", {}, { "www-authenticate": 'Bearer realm="guesslock-agent"' }) };
  }
  if (scope === "write" && who.scope !== "write") return { res: fail(403, "This token is read-only") };

  const limit = who.scope === "write" ? { n: 30, label: "write" } : { n: 120, label: "read" };
  const rl = await rateLimitShared(`rl:${who.id}:${scope}`, limit.n, 60_000);
  if (!rl.ok) return { res: fail(429, `Rate limit exceeded (${limit.n}/min)`, {}, { "retry-after": String(rl.retryAfter) }) };
  return { who };
}

/** Parse and validate a JSON body with a strict schema. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { res: Response }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return { res: fail(413, "Body too large") };
  const text = await req.text();
  if (text.length > MAX_BODY) return { res: fail(413, "Body too large") };
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { res: fail(400, "Body is not valid JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { res: fail(422, "Invalid body", { issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).slice(0, 20) }) };
  }
  return { data: parsed.data };
}

export const isDryRun = (req: Request) => ["1", "true"].includes(new URL(req.url).searchParams.get("dryRun") ?? "");

/** Record a write in the audit log. Never throws: auditing must not break the request. */
export async function audit(who: Who, req: Request, summary: Record<string, unknown>) {
  try {
    const url = new URL(req.url);
    await db.syncRun.create({
      data: {
        kind: "agent-api", status: "ok", finishedAt: new Date(),
        counts: { by: who.id, method: req.method, path: url.pathname } as Prisma.InputJsonValue,
        diff: summary as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[agent-api] audit failed", e);
  }
}
