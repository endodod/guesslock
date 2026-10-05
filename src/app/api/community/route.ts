// Community puzzles API. GET ?kind=&sort=new|popular: the list. POST { action: "create", puzzle } publishes one (signed in);
// { action: "play", id, entries } replays a puzzle (anyone; stateless like Endless); { action: "report", id, reason? }
// reports one (signed in); { action: "delete", id } deletes your own.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";
import { CommunityInput } from "@/lib/community/rules";
import { CommunityError, createCommunityPuzzle, deleteOwnCommunity, guestKey, listCommunityPuzzles, playCommunity, reportCommunity } from "@/lib/community/service";

const headers = { "cache-control": "no-store" };
const Id = z.string().regex(/^[a-z0-9]{10}$/);

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), puzzle: CommunityInput }),
  z.object({ action: z.literal("play"), id: Id, entries: z.array(z.string().max(128)).max(200) }),
  z.object({ action: z.literal("report"), id: Id, reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("delete"), id: Id }),
]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const puzzles = await listCommunityPuzzles({
    kind: kind === "seance" || kind === "constellation" ? kind : undefined,
    sort: url.searchParams.get("sort") === "popular" ? "popular" : "new",
  });
  return NextResponse.json({ puzzles }, { headers });
}

export async function POST(req: Request) {
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That puzzle isn't complete yet." }, { status: 400, headers });
  const body = parsed.data;
  const ip = clientIp(req);

  if (body.action === "play") {
    if (!rateLimit(`community-play:${ip}`, 240, 60_000).ok) return tooMany(60);
    const user = await currentUser();
    const v = await playCommunity(body.id, body.entries, user?.id ?? guestKey(ip));
    return v ? NextResponse.json(v, { headers }) : NextResponse.json({ error: "gone" }, { status: 404, headers });
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
  await ensureProfile(user);
  try {
    if (body.action === "create") {
      const limit = await rateLimitShared(`community-create:${user.id}`, 10, 60 * 60_000);
      if (!limit.ok) return tooMany(limit.retryAfter);
      return NextResponse.json(await createCommunityPuzzle(user.id, body.puzzle), { headers });
    }
    if (body.action === "report") {
      const limit = await rateLimitShared(`community-report:${user.id}`, 20, 60 * 60_000);
      if (!limit.ok) return tooMany(limit.retryAfter);
      return NextResponse.json(await reportCommunity(body.id, user.id, body.reason), { headers });
    }
    const ok = await deleteOwnCommunity(body.id, user.id);
    return ok ? NextResponse.json({ ok }, { headers }) : NextResponse.json({ error: "Not yours." }, { status: 403, headers });
  } catch (e) {
    if (e instanceof CommunityError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
