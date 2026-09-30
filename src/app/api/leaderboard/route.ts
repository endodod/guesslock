import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { BOARDS, getBoard, type Board } from "@/lib/accounts/leaderboard";

export async function GET(req: Request) {
  const b = new URL(req.url).searchParams.get("board") as Board;
  const board = BOARDS.some((x) => x.id === b) ? b : "today";
  const user = await currentUser();
  return NextResponse.json(await getBoard(board, user?.id), { headers: { "cache-control": "no-store" } });
}
