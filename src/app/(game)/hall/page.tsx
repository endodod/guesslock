import { currentUser } from "@/lib/auth/server";
import { BOARDS, getBoard } from "@/lib/accounts/leaderboard";
import { Hall } from "@/components/Hall";

export const metadata = { title: "The Hall — Leaderboards" };

export default async function HallPage() {
  const user = await currentUser();
  const boards = await Promise.all(BOARDS.map((b) => getBoard(b.id, user?.id)));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-brass">The Hall</h1>
      <p className="mb-6 text-ash">Leaderboards. Only puzzles played on their own day while signed in count.</p>
      <Hall boards={BOARDS} results={boards} signedIn={!!user} />
    </div>
  );
}
