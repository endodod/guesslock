"use client";
// Renders a clue exactly as players see it (the real ClueStage), inside the game's context and styles.
import { GameProvider } from "@/components/GameProvider";
import { ClueStage } from "@/components/ClueStage";
import type { Clue } from "@/lib/engine/types";

export function DebugStage({ clue, done, today, subject }: { clue: Clue; done: boolean; today: string; subject: "hero" | "item" }) {
  return (
    <GameProvider today={today}>
      <div className="rounded-lg bg-[#0e0d0b] p-4 text-[#e8dcc4]">
        <ClueStage clue={clue} rows={[]} done={done} subject={subject} />
      </div>
    </GameProvider>
  );
}

/** Clears this browser's saved play of one lock and day, to replay it from scratch as a player. */
export function ResetLocal({ date, slug }: { date: string; slug: string }) {
  return (
    <button
      type="button"
      className="rounded border border-neutral-400 px-2 py-1 text-sm hover:bg-neutral-100"
      onClick={() => {
        try {
          const raw = JSON.parse(localStorage.getItem("guesslock") ?? "null");
          if (raw?.progress?.[date]?.[slug]) {
            delete raw.progress[date][slug];
            localStorage.setItem("guesslock", JSON.stringify(raw));
            alert(`Cleared your local ${slug} play of ${date}. Signed-in plays are kept on the server.`);
          } else alert("Nothing saved locally for this lock and day.");
        } catch { alert("Local storage is blocked."); }
      }}
    >
      Reset my local play
    </button>
  );
}
