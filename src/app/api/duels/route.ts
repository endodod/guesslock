// Duels API (signed in). GET: your challenges, games and recent results; ?badge=1 just the number waiting for you.
// POST { game, opponent?, hero? }: challenge a player by name, or (without a name) make an open link.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";
import { GAME_IDS, type GameId } from "@/lib/duels/games";
import { createDuel, duelBadge, DuelError, listDuels } from "@/lib/duels/service";

const headers = { "cache-control": "no-store" };
const Create = z.object({ game: z.enum(GAME_IDS as [GameId, ...GameId[]]), opponent: z.string().trim().max(40).optional(), hero: z.number().int().positive().nullable().optional() });

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
  if (new URL(req.url).searchParams.get("badge")) return NextResponse.json({ count: await duelBadge(user.id) }, { headers });
  return NextResponse.json(await listDuels(user.id), { headers });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a game." }, { status: 400, headers });
  const limit = await rateLimitShared(`duel-create:${user.id}`, 20, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  await ensureProfile(user);
  try {
    const d = await createDuel(user.id, parsed.data.game, parsed.data.opponent, parsed.data.hero);
    return NextResponse.json({ id: d.id }, { headers });
  } catch (e) {
    if (e instanceof DuelError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
