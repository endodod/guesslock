// Download of everything GUESSLOCK stores about the signed-in player.
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { exportAccount } from "@/lib/accounts/service";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return new NextResponse(JSON.stringify(await exportAccount(user), null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="guesslock-account.json"',
      "cache-control": "no-store",
    },
  });
}
