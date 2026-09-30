// Practice "My matches": POST { account } (Steam profile URL, SteamID64, [U:1:n] or account ID).
// Lists the last 20 matches; ones with a replay are queued for the next harvest (rate limited per IP).
import { NextResponse } from "next/server";
import { z } from "zod";
import { myMatches, parseAccount, requesterHash } from "@/lib/omens/practice";

export async function POST(req: Request) {
  const body = z.object({ account: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const account = parseAccount(body.data.account);
  if (!account) return NextResponse.json({ error: "Enter a Steam profile URL (…/profiles/7656…), a SteamID64 or an account ID." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  try {
    const matches = await myMatches(account, requesterHash(ip));
    return NextResponse.json({ account, matches }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load that player's match history. Try again later." }, { status: 502 });
  }
}
