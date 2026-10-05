// Endless mode API. POST { slug, avoid? } creates a practice puzzle and returns its token; POST { token, guesses, … }
// plays one (stateless, like /api/play: the client sends its guesses, the server recomputes the view).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createEndless, isEndlessLock, playEndless } from "@/lib/endless";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

const Create = z.object({ slug: z.string().max(40), avoid: z.array(z.string().max(80)).max(20).optional() });
const Play = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  guesses: z.array(z.string().max(128)).max(200),
  bonus: z.string().max(40).optional(),
  giveUp: z.boolean().optional(),
  hard: z.boolean().optional(),
});
const headers = { "cache-control": "no-store" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ip = clientIp(req);
  const play = Play.safeParse(body);
  if (play.success) {
    if (!rateLimit(`endless-play:${ip}`, 240, 60_000).ok) return tooMany(60);
    const { token, guesses, ...opts } = play.data;
    const r = await playEndless(token, guesses, opts);
    if (!r) return NextResponse.json({ error: "gone" }, { status: 404, headers });
    // The answer id lets the client skip it next time; only sent once the puzzle is finished.
    const done = r.view.status === "won" || r.view.status === "lost";
    return NextResponse.json({ ...r.view, ...(done ? { answerKey: r.answerId } : {}) }, { headers });
  }
  const create = Create.safeParse(body);
  if (!create.success || !isEndlessLock(create.data.slug)) return NextResponse.json({ error: "bad request" }, { status: 400, headers });
  // Building a puzzle renders clue images: keep it to a human pace.
  const limit = rateLimit(`endless-new:${ip}`, 20, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const made = await createEndless(create.data.slug, create.data.avoid);
  if (!made) return NextResponse.json({ error: "nothing to build" }, { status: 409, headers });
  return NextResponse.json(made, { headers });
}
