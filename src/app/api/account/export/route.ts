// Download of everything GUESSLOCK stores about the signed-in player.
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { exportAccount } from "@/lib/accounts/service";
import { rateLimit, tooMany } from "@/lib/server/ratelimit";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = rateLimit(`export:${user.id}`, 5, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  return new NextResponse(JSON.stringify(await exportAccount(user), null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="guesslock-account.json"',
      "cache-control": "no-store",
    },
  });
}
