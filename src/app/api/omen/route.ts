// Daily Omen: POST { date, slug } -> snapshot; POST { date, slug, answers } -> snapshot + reveal.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLock, omenOf } from "@/locks.config";
import { isDay, todayDate } from "@/lib/day";
import { getPuzzle } from "@/lib/server/puzzles";
import { omenView, parseAnswer } from "@/lib/omens/serve";
import type { OmenPayload } from "@/lib/omens/types";

const Body = z.object({ date: z.string().refine(isDay), slug: z.string(), answers: z.unknown().optional() });

export async function POST(req: Request) {
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
  return NextResponse.json(omenView(row.payload as unknown as OmenPayload, guess), { headers: { "cache-control": "no-store" } });
}
