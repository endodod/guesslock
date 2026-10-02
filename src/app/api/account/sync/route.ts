// Merges a device's local history into the signed-in account and returns the account's progress.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { syncProgress } from "@/lib/accounts/service";
import { tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";

/** A device's whole local history is a few hundred KB at most; anything larger is not a game client. */
const MAX_BODY = 2_000_000;

const Rec = z.object({ g: z.array(z.string().max(64)).max(200), b: z.string().max(40).optional(), archive: z.boolean().optional(), o: z.unknown().optional() });
const Body = z.object({ progress: z.record(z.string(), z.record(z.string(), Rec)).default({}) });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = await rateLimitShared(`sync:${user.id}`, 10, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  const raw = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  // Tolerate unknown fields in local records: only guesses, bonus, archive and Omen answers are read.
  const parsed = Body.safeParse({
    progress: Object.fromEntries(
      Object.entries((raw?.progress ?? {}) as Record<string, Record<string, Record<string, unknown>>>).map(([d, locks]) => [
        d,
        Object.fromEntries(Object.entries(locks ?? {}).map(([s, r]) => [s, { g: r?.g, b: r?.b, archive: r?.archive, o: r?.o }])),
      ]),
    ),
  });
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const result = await syncProgress(user, parsed.data.progress);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
