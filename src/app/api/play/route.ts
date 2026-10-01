import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getLock } from "@/locks.config";
import { isDay, numberFor, todayDate } from "@/lib/day";
import { getCatalog, lookupFor } from "@/lib/engine/catalog";
import { evaluate } from "@/lib/engine/play";
import { getPuzzle } from "@/lib/server/puzzles";
import { currentUser } from "@/lib/auth/server";
import { playAsUser, playSeanceAsUser } from "@/lib/accounts/service";
import { evaluateSeance } from "@/lib/seance/play";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

const Body = z.object({
  date: z.string().refine(isDay),
  slug: z.string(),
  guesses: z.array(z.string().max(64)).max(200),
  bonus: z.string().max(40).optional(),
  giveUp: z.boolean().optional(),
  hard: z.boolean().optional(),
});

export async function POST(req: Request) {
  // Generous (a fast player sends a few a minute), but stops scripted hammering.
  const limit = rateLimit(`play:${clientIp(req)}`, 300, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { date, slug, guesses, bonus, giveUp = false, hard = false } = parsed.data;
  const lock = getLock(slug);
  if (!lock) return NextResponse.json({ error: "unknown lock" }, { status: 404 });
  // No peeking at future puzzles.
  if (date > todayDate()) return NextResponse.json({ error: "not yet" }, { status: 403 });
  // Independent lookups run together; the catalog and the puzzle are cached, the session is a network call.
  const [row, user, catalog] = await Promise.all([getPuzzle(date, slug), currentUser(), lock.box ? null : getCatalog()]);
  if (!row) return NextResponse.json({ error: "empty" }, { status: 404 });

  const headers = { "cache-control": "no-store" };
  // A signed-in play is saved after the response is sent: the answer to a guess doesn't depend on the write.
  const defer = (task: () => Promise<void>) => after(task);
  if (!!lock.box) {
    // The Séance: guesses are submissions ("id,id,id,id") and hint requests; see src/lib/seance/play.ts.
    if (user) {
      const r = await playSeanceAsUser(user, row, slug, guesses, defer);
      return NextResponse.json({ ...r.view, account: { guesses: r.guesses, ranked: r.ranked } }, { headers });
    }
    const { view, accepted } = evaluateSeance(lock, row, numberFor(date), guesses);
    return NextResponse.json({ ...view, entries: accepted }, { headers });
  }
  if (user) {
    // Signed in: the server records the play and its guess list is authoritative.
    const r = await playAsUser(user, row, slug, guesses, bonus, giveUp, hard, defer);
    return NextResponse.json({ ...r.view, account: { guesses: r.guesses, bonus: r.bonus, ranked: r.ranked } }, { headers });
  }
  const view = evaluate(lock, row, numberFor(date), guesses, bonus, lookupFor(catalog!, lock.guess), { giveUp, hard });
  return NextResponse.json(view, { headers });
}
