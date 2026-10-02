// The Black Market API (signed in only). GET: the shop window; ?view=inventory the collection; ?view=earn the ways to
// earn souls (daily reward, invitations); ?view=daily just the daily reward. POST: { action, … } — open a case or a Collector's Crate, sell an
// item (or every spare copy of it), claim a set bonus, wear flair, claim the daily reward, claim an invitation.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { claimSet, equip, inventoryState, marketState, MarketError, openCase, openCrate, sellItem, sellSpares } from "@/lib/market/service";
import { claimDaily, dailyState, inviteState, redeemInvite } from "@/lib/market/earn";
import { tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";
import { INVITE_COOKIE } from "@/lib/market/rewards";

const headers = { "cache-control": "no-store" };

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), caseId: z.string().max(40) }),
  z.object({ action: z.literal("crate"), crateId: z.string().max(40), price: z.number().int().nonnegative() }),
  z.object({ action: z.literal("sell"), itemId: z.number().int().positive() }),
  z.object({ action: z.literal("sellSpares"), itemKey: z.string().max(60) }),
  z.object({ action: z.literal("claim"), setId: z.string().max(40) }),
  z.object({ action: z.literal("equip"), slot: z.enum(["title", "color", "theme"]), key: z.string().max(60).nullable() }),
  z.object({ action: z.literal("daily") }),
  z.object({ action: z.literal("redeem"), token: z.string().max(200) }),
]);

async function signedIn() {
  const user = await currentUser();
  if (!user) return null;
  await ensureProfile(user);
  return user;
}

async function earnState(userId: string) {
  const token = (await cookies()).get(INVITE_COOKIE)?.value ?? null;
  const [daily, invite] = await Promise.all([dailyState(userId), inviteState(userId, token)]);
  return { daily, invite };
}

export async function GET(req: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401, headers });
  const view = new URL(req.url).searchParams.get("view");
  if (view === "daily") return NextResponse.json(await dailyState(user.id), { headers });
  if (view === "earn") return NextResponse.json(await earnState(user.id), { headers });
  return NextResponse.json(view === "inventory" ? await inventoryState(user.id) : await marketState(user.id), { headers });
}

export async function POST(req: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401, headers });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers });
  const limit = await rateLimitShared(`market:${user.id}`, 40, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const a = parsed.data;
  try {
    const result =
      a.action === "open" ? await openCase(user.id, a.caseId)
      : a.action === "crate" ? await openCrate(user.id, a.crateId, a.price)
      : a.action === "sell" ? await sellItem(user.id, a.itemId)
      : a.action === "sellSpares" ? await sellSpares(user.id, a.itemKey)
      : a.action === "claim" ? await claimSet(user.id, a.setId)
      : a.action === "daily" ? await claimDaily(user.id)
      : a.action === "redeem" ? await redeemInvite(user.id, a.token)
      : await equip(user.id, a.slot, a.key);
    return NextResponse.json({ ok: true, result: result ?? null, state: await marketState(user.id, false), inventory: await inventoryState(user.id), earn: await earnState(user.id) }, { headers });
  } catch (e) {
    if (e instanceof MarketError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
