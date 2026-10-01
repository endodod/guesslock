"use client";
import Link from "next/link";
import { useState } from "react";
import type { BoardResult, BoardRow } from "@/lib/accounts/leaderboard";
import { DecoFrame, Icon } from "./ui";

type BoardInfo = { id: string; label: string; sub: string };

/** A player's name in their equipped colour (a gradient for the legendary one). */
export function PlayerName({ name, color }: { name: string; color?: string | null }) {
  if (!color) return <>{name}</>;
  const gradient = color.startsWith("linear-gradient");
  return (
    <span style={gradient ? { backgroundImage: color, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } : { color }}>{name}</span>
  );
}

function Row({ r, unit }: { r: BoardRow; unit: string }) {
  const medal = r.rank === 1 ? "text-[#e8c36a]" : r.rank === 2 ? "text-[#c9c9d1]" : r.rank === 3 ? "text-[#c8895a]" : "text-ash";
  return (
    <li className={`flex min-h-12 items-center gap-3 rounded-sm px-3 py-2 ${r.me ? "bg-ecto/10 ring-1 ring-ecto/50" : "odd:bg-iron/50"}`}>
      <span className={`w-8 text-right font-mono text-lg ${medal}`}>{r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-paper">
          <PlayerName name={r.name} color={r.color} />{r.me && <span className="ml-2 text-xs text-ecto">you</span>}
        </span>
        {(r.title || r.detail) && <span className="block truncate text-xs text-ash">{r.title && <span className="text-brass">{r.title}</span>}{r.title && r.detail ? " · " : ""}{r.detail}</span>}
      </span>
      <span className="font-mono text-lg text-brass">{r.value}</span>
      <span className="w-12 text-xs text-ash">{unit}</span>
    </li>
  );
}

export function Hall({ boards, results, signedIn }: { boards: BoardInfo[]; results: BoardResult[]; signedIn: boolean }) {
  const [active, setActive] = useState(boards[0].id);
  const result = results.find((r) => r.board === active)!;
  const info = boards.find((b) => b.id === active)!;
  const unit = active === "streak" ? "days" : active === "collectors" ? "items" : "souls";
  const meOutside = result.me && !result.rows.some((r) => r.me);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Leaderboards" className="flex flex-wrap gap-2">
        {boards.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={b.id === active}
            onClick={() => setActive(b.id)}
            className={`min-h-11 rounded-[3px] border px-4 ${b.id === active ? "border-brass bg-brass/15 text-paper" : "border-brass/30 text-ash hover:text-paper"}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <DecoFrame className="p-4 md:p-5" role="tabpanel">
        <p className="mb-3 text-sm text-ash">{info.sub} · {result.total} {result.total === 1 ? "keeper" : "keepers"}</p>
        {result.rows.length === 0 ? (
          <p className="py-6 text-center text-ash">Nothing in this box yet. Be the first.</p>
        ) : (
          <ol className="space-y-1">
            {result.rows.map((r) => <Row key={r.userId} r={r} unit={unit} />)}
          </ol>
        )}
        {meOutside && (
          <ol className="mt-3 border-t border-brass/20 pt-3"><Row r={result.me!} unit={unit} /></ol>
        )}
      </DecoFrame>

      {!signedIn ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ash">
          <Icon name="lock" className="h-4 w-4 text-brass" />
          <Link href="/auth/sign-up?next=/hall" className="text-brass underline-offset-4 hover:underline">Create an account</Link> or
          <Link href="/auth/sign-in?next=/hall" className="text-brass underline-offset-4 hover:underline">sign in</Link> to appear here.
        </p>
      ) : !result.me ? (
        <p className="text-sm text-ash">You&apos;re not on this board yet. Hidden from leaderboards? Check your <Link href="/account" className="text-brass underline-offset-4 hover:underline">account</Link>.</p>
      ) : null}

      <details className="text-sm text-ash">
        <summary className="cursor-pointer text-paper">What counts?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Locks played on their own day while signed in, one guess at a time.</li>
          <li>Archive replays and plays imported from before you signed in count for your own stats only.</li>
          <li>Ties are broken by more locks opened, then alphabetically.</li>
          <li>Streaks count consecutive days with at least one opened lock; a streak survives until the end of the next day.</li>
          <li>Spending souls in <Link href="/market" className="text-brass underline-offset-4 hover:underline">The Black Market</Link> never lowers your place: the boards rank souls earned.</li>
        </ul>
      </details>
    </div>
  );
}
