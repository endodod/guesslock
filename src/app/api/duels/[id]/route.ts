// One duel. GET ?v=<version>: the board ({ unchanged: true } while nothing has moved, so polling stays cheap).
// POST { action: "accept" | "decline" | "resign" } or { action: "move", version, move } (signed in).
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";
import { acceptDuel, declineDuel, DuelError, getDuel, moveDuel, resignDuel, viewOf } from "@/lib/duels/service";

const headers = { "cache-control": "no-store" };
const Id = /^[a-z0-9]{10}$/;
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("resign") }),
  z.object({ action: z.literal("move"), version: z.number().int().nonnegative(), move: z.unknown() }),
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!Id.test(id)) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  if (!rateLimit(`duel-poll:${clientIp(req)}`, 300, 60_000).ok) return tooMany(30);
  const d = await getDuel(id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  const v = Number(new URL(req.url).searchParams.get("v"));
  if (Number.isInteger(v) && v === d.version) return NextResponse.json({ unchanged: true }, { headers });
  const user = await currentUser();
  return NextResponse.json(await viewOf(d, user?.id ?? null), { headers });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!Id.test(id)) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers });
  if (!rateLimit(`duel-act:${user.id}`, 120, 60_000).ok) return tooMany(30);
  await ensureProfile(user);
  const a = parsed.data;
  try {
    const d = a.action === "accept" ? await acceptDuel(id, user.id)
      : a.action === "decline" ? await declineDuel(id, user.id)
      : a.action === "resign" ? await resignDuel(id, user.id)
      : await moveDuel(id, user.id, a.version, a.move);
    return NextResponse.json(await viewOf(d, user.id), { headers });
  } catch (e) {
    if (e instanceof DuelError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
