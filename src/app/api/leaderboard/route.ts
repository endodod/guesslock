import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { BOARDS, getBoard, type Board } from "@/lib/accounts/leaderboard";
import { clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

export async function GET(req: Request) {
  const limit = rateLimit(`board:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const b = new URL(req.url).searchParams.get("board") as Board;
  const board = BOARDS.some((x) => x.id === b) ? b : "today";
  const user = await currentUser();
  return NextResponse.json(await getBoard(board, user?.id), { headers: { "cache-control": "no-store" } });
}
