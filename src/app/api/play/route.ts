import { NextResponse } from "next/server";
import { z } from "zod";
import { getLock } from "@/locks.config";
import { isDay, numberFor, todayDate } from "@/lib/day";
import { getCatalog, lookupFor } from "@/lib/engine/catalog";
import { evaluate } from "@/lib/engine/play";
import { getPuzzle } from "@/lib/server/puzzles";

const Body = z.object({
  date: z.string().refine(isDay),
  slug: z.string(),
  guesses: z.array(z.string().max(40)).max(200),
  bonus: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { date, slug, guesses, bonus } = parsed.data;
  const lock = getLock(slug);
  if (!lock) return NextResponse.json({ error: "unknown lock" }, { status: 404 });
  // No peeking at future puzzles.
  if (date > todayDate()) return NextResponse.json({ error: "not yet" }, { status: 403 });
  const row = await getPuzzle(date, slug);
  if (!row) return NextResponse.json({ error: "empty" }, { status: 404 });
  const catalog = await getCatalog();
  const view = evaluate(lock, row, numberFor(date), guesses, bonus, lookupFor(catalog, lock.guess));
  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
