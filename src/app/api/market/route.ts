// The Black Market API (signed in only). GET: the shop window, or ?view=inventory for the collection. POST: { action, … }
// — open a case, sell an item, claim a set bonus, wear flair.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { claimSet, equip, inventoryState, marketState, MarketError, openCase, sellItem } from "@/lib/market/service";
import { rateLimit, tooMany } from "@/lib/server/ratelimit";

const headers = { "cache-control": "no-store" };
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), caseId: z.string().max(40) }),
  z.object({ action: z.literal("sell"), itemId: z.number().int().positive() }),
  z.object({ action: z.literal("claim"), setId: z.string().max(40) }),
  z.object({ action: z.literal("equip"), slot: z.enum(["title", "color", "theme"]), key: z.string().max(60).nullable() }),
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
  const view = new URL(req.url).searchParams.get("view");
  return NextResponse.json(view === "inventory" ? await inventoryState(user.id) : await marketState(user.id), { headers });
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
      : a.action === "sell" ? await sellItem(user.id, a.itemId)
      : a.action === "claim" ? await claimSet(user.id, a.setId)
      : await equip(user.id, a.slot, a.key);
    return NextResponse.json({ ok: true, result: result ?? null, state: await marketState(user.id, false), inventory: await inventoryState(user.id) }, { headers });
  } catch (e) {
    if (e instanceof MarketError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    throw e;
  }
}
