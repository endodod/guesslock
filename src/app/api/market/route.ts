// The Black Market API (signed in only). GET: balance, collection, offers. POST: { action, … } — open a case, equip,
// offer a trade, answer an offer.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { collectionOf, createOffer, equip, marketState, MarketError, openCase, respondOffer } from "@/lib/market/service";
import { rateLimit, tooMany } from "@/lib/server/ratelimit";

const headers = { "cache-control": "no-store" };
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), caseId: z.string().max(40) }),
  z.object({ action: z.literal("equip"), slot: z.enum(["title", "color", "theme"]), key: z.string().max(60).nullable() }),
  z.object({
    action: z.literal("offer"), to: z.string().min(1).max(40),
    giveItems: z.array(z.number().int()).max(6), giveSouls: z.number().int().min(0).max(10_000),
    wantItems: z.array(z.number().int()).max(6), wantSouls: z.number().int().min(0).max(10_000),
    message: z.string().max(140).optional(),
  }),
  z.object({ action: z.literal("respond"), id: z.number().int().positive(), answer: z.enum(["accept", "decline", "cancel"]) }),
]);

async function signedIn() {
  const user = await currentUser();
  if (!user) return null;
  await ensureProfile(user);
  return user;
}

export async function GET(req: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401, headers });
  // ?of=<display name>: another player's collection (to ask for items in a trade).
  const of = new URL(req.url).searchParams.get("of");
  if (of) {
    const items = await collectionOf(of.slice(0, 40));
    return items ? NextResponse.json({ items }, { headers }) : NextResponse.json({ error: "No player by that name." }, { status: 404, headers });
  }
  return NextResponse.json(await marketState(user.id), { headers });
}

export async function POST(req: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401, headers });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers });
  const limit = rateLimit(`market:${user.id}`, 40, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const a = parsed.data;
  try {
    const result =
      a.action === "open" ? await openCase(user.id, a.caseId)
      : a.action === "equip" ? await equip(user.id, a.slot, a.key)
      : a.action === "offer" ? await createOffer(user.id, a)
      : await respondOffer(user.id, a.id, a.answer);
    return NextResponse.json({ ok: true, result: result ?? null, state: await marketState(user.id) }, { headers });
  } catch (e) {
    if (e instanceof MarketError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
