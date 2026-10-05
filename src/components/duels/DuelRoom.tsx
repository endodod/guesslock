"use client";
// One duel: the board, whose turn it is, and the accept / decline / resign buttons. The opponent's moves arrive by
// polling (cheap: the server answers "unchanged" while the version is the same).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GAMES, type Seat } from "@/lib/duels/games";
import type { DuelView } from "@/lib/duels/service";
import { useGame } from "../GameProvider";
import { Button, DecoFrame } from "../ui";
import { CheckersBoard, Connect4Board, Orb, SEAT_NAME, TicTacToeBoard } from "./Boards";

const POLL_ACTIVE = 1500;
const POLL_IDLE = 5000;

async function call(id: string, body: unknown): Promise<{ view?: DuelView; error?: string }> {
  const res = await fetch(`/api/duels/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return res.ok ? { view: json } : { error: json?.error ?? "Something went wrong. Try again." };
}

function timeLeft(deadline: string, now: number): string {
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function DuelRoom({ initial, signedIn }: { initial: DuelView; signedIn: boolean }) {
  const { toast, play } = useGame();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const versionRef = useRef(view.version);
  const game = GAMES[view.game];
  const myTurn = view.status === "active" && view.seat !== null && view.turn === view.seat;

  const apply = useCallback((v: DuelView) => {
    if (v.version > versionRef.current) {
      if (v.moves > view.moves && v.seat !== null && v.turn === v.seat) play("tick");
      if (v.status === "done" && view.status !== "done") play(v.winner === v.seat ? "click" : "creak");
    }
    versionRef.current = v.version;
    setView(v);
  }, [play, view.moves, view.status]);

  // Poll while something can still change: fast while waiting for the opponent's move, slower for an open challenge.
  useEffect(() => {
    if (view.status !== "active" && view.status !== "invited") return;
    if (myTurn) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/duels/${view.id}?v=${versionRef.current}`).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (json && !json.unchanged && json.id) apply(json as DuelView);
    }, view.status === "active" ? POLL_ACTIVE : POLL_IDLE);
    return () => clearInterval(id);
  }, [view.id, view.status, myTurn, apply]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await call(view.id, body);
    setBusy(false);
    if (r.view) apply(r.view);
    else toast(r.error!);
    return !!r.view;
  };
  const onMove = (move: unknown) => { void act({ action: "move", version: view.version, move }); };

  const name = (s: Seat) => view.players[s]?.name ?? (view.invitee && s === 1 ? view.invitee : "Waiting for a challenger");
  const board = (() => {
    const props = { seat: view.seat, myTurn, busy, onMove };
    if (view.game === "tictactoe") return <TicTacToeBoard state={view.state as never} {...props} />;
    if (view.game === "connect4") return <Connect4Board state={view.state as never} {...props} />;
    return <CheckersBoard state={view.state as never} {...props} />;
  })();

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/duels/${view.id}`;
  const status = (() => {
    if (view.status === "invited") return view.seat === 0 ? (view.invitee ? `Waiting for ${view.invitee} to accept.` : "Waiting for someone to accept your link.") : "You've been challenged.";
    if (view.status === "declined") return "This challenge was called off.";
    if (view.status === "expired") return "This challenge lapsed.";
    if (view.status === "done") {
      if (view.winner === null) return "A draw: the souls stay where they are.";
      const won = view.seat === view.winner;
      const how = view.result === "resign" ? " by resignation" : view.result === "timeout" ? " on time" : "";
      return view.seat === null ? `${name(view.winner)} won${how}.` : won ? `You won${how}!` : `You lost${how}.`;
    }
    return myTurn ? "Your move." : view.seat === null ? `${name(view.turn)} to move.` : `${name(view.turn)} is thinking…`;
  })();

  return (
    <div className="space-y-5 pb-16">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className={`${s === 1 ? "order-3" : ""} flex flex-col items-center gap-1 rounded-sm border p-2 ${view.status === "active" && view.turn === s ? "border-ecto/70 bg-ecto/5" : "border-brass/20"}`}>
            <Orb seat={s} className="h-6 w-6" />
            <span className="max-w-full truncate text-sm text-paper">{name(s)}{view.seat === s ? " (you)" : ""}</span>
            <span className="smallcaps text-[0.6rem] text-ash">{SEAT_NAME[s]}</span>
          </div>
        ))}
        <span className="order-2 font-display text-brass">vs</span>
      </div>

      <p role="status" aria-live="polite" className={`text-center font-display text-xl ${myTurn ? "text-ecto" : "text-paper"}`}>{status}</p>
      {view.status === "active" && view.deadline && <p className="-mt-3 text-center text-xs text-ash">{myTurn ? "You have" : "They have"} {timeLeft(view.deadline, now)} left for this move, or the game is lost.</p>}
      {view.status === "done" && view.seat !== null && view.seat === view.winner && (
        <p className="-mt-3 text-center text-sm">{view.paid ? <span className="text-brass">+{view.paid} souls</span> : <span className="text-ash">No souls this time: a quick game, already paid today against this player, or today&apos;s limit reached.</span>}</p>
      )}

      {board}

      {view.status === "invited" && (
        <DecoFrame className="space-y-3 p-4 text-center" corners={false}>
          {view.canAccept ? (
            <div className="flex justify-center gap-2">
              <Button onClick={() => act({ action: "accept" })} disabled={busy}>Accept the duel</Button>
              {view.invitee && <Button variant="ghost" onClick={() => act({ action: "decline" })} disabled={busy}>Decline</Button>}
            </div>
          ) : !signedIn ? (
            <p className="text-sm text-ash"><Link href={`/auth/sign-in?next=/duels/${view.id}`} className="text-brass underline-offset-4 hover:underline">Sign in</Link> to accept this duel.</p>
          ) : view.seat === 0 ? (
            <>
              {!view.invitee && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <input readOnly value={link} className="min-h-11 w-full max-w-sm rounded-[3px] border border-brass/40 bg-ink/80 px-3 text-sm text-paper" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(link); toast("Link copied."); }}>Copy link</Button>
                </div>
              )}
              <Button variant="ghost" onClick={() => act({ action: "decline" })} disabled={busy}>Call it off</Button>
            </>
          ) : (
            <p className="text-sm text-ash">This challenge is for another player.</p>
          )}
        </DecoFrame>
      )}

      {view.status === "active" && view.seat !== null && (
        <div className="flex justify-center">
          {confirmResign ? (
            <div role="alertdialog" className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-paper">Resign and give the win away?</span>
              <Button variant="cursed" onClick={() => { setConfirmResign(false); void act({ action: "resign" }); }} disabled={busy}>Resign</Button>
              <Button variant="ghost" onClick={() => setConfirmResign(false)}>Keep playing</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmResign(true)} className="min-h-11 px-3 text-sm text-ash underline-offset-4 hover:text-paper hover:underline">Resign</button>
          )}
        </div>
      )}

      <p className="text-center text-xs text-ash">{game.name}: {game.blurb}</p>
      <p className="text-center text-sm"><Link href="/duels" className="text-brass underline-offset-4 hover:underline">All your duels</Link></p>
    </div>
  );
}
