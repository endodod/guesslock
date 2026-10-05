"use client";
// The duels lobby: challenge a player by name (or make an open link), and your challenges, games and results.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAMES, GAME_IDS, type GameId } from "@/lib/duels/games";
import type { DuelLists, DuelView, Stone } from "@/lib/duels/service";
import { useGame } from "../GameProvider";
import { Button, DecoFrame } from "../ui";
import { StonePicker, useStone } from "./StonePicker";

export function DuelLobby({ initial, reward, cap, heroes }: { initial: DuelLists; reward: number; cap: number; heroes: Stone[] }) {
  const router = useRouter();
  const { toast } = useGame();
  const [lists, setLists] = useState(initial);
  const [game, setGame] = useState<GameId>("connect4");
  const [opponent, setOpponent] = useState("");
  const [busy, setBusy] = useState(false);
  const [stone, setStone] = useStone(heroes);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/duels").catch(() => null);
    if (res?.ok) setLists(await res.json());
  }, []);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const challenge = async (byName: boolean) => {
    setBusy(true);
    const res = await fetch("/api/duels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game, opponent: byName ? opponent : undefined, hero: stone }) });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) router.push(`/duels/${json.id}`);
    else toast(json?.error ?? "Could not make the challenge.");
  };

  const row = (d: DuelView) => {
    const them = d.seat === 0 ? d.players[1]?.name ?? d.invitee ?? "open link" : d.players[0].name;
    const mine = d.status === "active" && d.seat === d.turn;
    const result = d.status === "done" ? (d.winner === null ? "Draw" : d.winner === d.seat ? `Won${d.paid ? ` · +${d.paid}` : ""}` : "Lost") : null;
    return (
      <li key={d.id}>
        <Link href={`/duels/${d.id}`} className={`flex min-h-12 items-center justify-between gap-3 rounded-sm border px-3 py-2 ${mine || d.canAccept ? "border-ecto/60 bg-ecto/5" : "border-brass/20 hover:border-brass/60"}`}>
          <span className="min-w-0">
            <span className="block truncate text-paper">{GAMES[d.game].name} <span className="text-ash">vs</span> {them}</span>
            <span className="text-xs text-ash">{d.canAccept ? "Challenges you" : mine ? "Your move" : d.status === "active" ? "Their move" : d.status === "invited" ? "Waiting" : result}</span>
          </span>
          <span className="text-sm text-brass">{d.canAccept ? "Answer" : mine ? "Play" : "View"}</span>
        </Link>
      </li>
    );
  };
  const section = (title: string, items: DuelView[], empty?: string) => (items.length || empty) ? (
    <section className="space-y-2">
      <h2 className="smallcaps text-brass">{title}</h2>
      {items.length ? <ul className="space-y-2">{items.map(row)}</ul> : <p className="text-sm text-ash">{empty}</p>}
    </section>
  ) : null;

  return (
    <div className="space-y-8">
      <DecoFrame className="space-y-4 p-5">
        <h2 className="smallcaps text-brass">Issue a challenge</h2>
        <div role="radiogroup" aria-label="Game" className="grid gap-2 sm:grid-cols-3">
          {GAME_IDS.map((g) => (
            <button
              key={g} type="button" role="radio" aria-checked={game === g} onClick={() => setGame(g)}
              className={`rounded-[3px] border p-3 text-left ${game === g ? "border-brass bg-brass/15" : "border-brass/25 hover:border-brass/60"}`}
            >
              <span className="block font-display text-lg text-paper">{GAMES[g].name}</span>
              <span className="text-xs text-ash">{GAMES[g].blurb}</span>
            </button>
          ))}
        </div>
        <StonePicker heroes={heroes} value={stone} onChange={setStone} seat={0} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm text-ash">Opponent&apos;s display name</span>
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} maxLength={20} placeholder="Their name on the leaderboards" className="min-h-11 w-full rounded-[3px] border border-brass/50 bg-ink/80 px-3 text-paper" />
          </label>
          <Button onClick={() => challenge(true)} disabled={busy || opponent.trim().length < 3}>Challenge</Button>
          <Button variant="ghost" onClick={() => challenge(false)} disabled={busy}>Make a link instead</Button>
        </div>
        <p className="text-xs text-ash">A win pays {reward} souls, once a day per opponent and game, at most {cap} paid wins a day. Draws and very short games don&apos;t pay. A player who doesn&apos;t move for 24 hours loses.</p>
      </DecoFrame>

      {section("Challenges for you", lists.invites)}
      {section("Games in progress", lists.active, "No games right now.")}
      {section("Your open challenges", lists.open)}
      {section("Recent results", lists.recent)}
    </div>
  );
}
