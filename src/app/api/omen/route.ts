// Daily Omen: POST { date, slug } -> snapshot; POST { date, slug, answers } -> snapshot + reveal.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLock, omenOf } from "@/locks.config";
import { isDay, todayDate } from "@/lib/day";
import { getPuzzle } from "@/lib/server/puzzles";
import { omenView, parseAnswer } from "@/lib/omens/serve";
import type { OmenPayload } from "@/lib/omens/types";
import { currentUser } from "@/lib/auth/server";
import { recordOmen, recordedOmen } from "@/lib/accounts/service";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

const Body = z.object({ date: z.string().refine(isDay), slug: z.string(), answers: z.unknown().optional() });

export async function POST(req: Request) {
  const limit = rateLimit(`omen:${clientIp(req)}`, 120, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { date, slug, answers } = parsed.data;
  const lock = getLock(slug);
  const omen = lock && omenOf(lock);
  if (!omen) return NextResponse.json({ error: "unknown omen" }, { status: 404 });
  if (date > todayDate()) return NextResponse.json({ error: "not yet" }, { status: 403 });
  const row = await getPuzzle(date, slug);
  if (!row || row.sealed) return NextResponse.json({ error: "empty" }, { status: 404 });
  const guess = answers === undefined ? null : parseAnswer(omen, answers);
  if (answers !== undefined && !guess) return NextResponse.json({ error: "bad answers" }, { status: 400 });
  const headers = { "cache-control": "no-store" };
  const payload = row.payload as unknown as OmenPayload;
  const user = await currentUser();
  if (user) {
    // Signed in: the first lock-in is recorded and final; other devices get the recorded answers.
    if (guess) {
      const r = await recordOmen(user, row, slug, guess);
      return NextResponse.json({ ...omenView(payload, r.answers), account: { answers: r.answers, ranked: r.ranked } }, { headers });
    }
    const recorded = await recordedOmen(user.id, date, slug);
    if (recorded) return NextResponse.json({ ...omenView(payload, recorded), account: { answers: recorded, ranked: null } }, { headers });
  }
  return NextResponse.json(omenView(payload, guess), { headers });
}
