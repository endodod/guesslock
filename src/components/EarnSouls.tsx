"use client";
// "Want to earn more souls?": the daily login reward, your invite link, and the other ways souls come in.
import { useState } from "react";
import type { dailyState, inviteState } from "@/lib/market/earn";
import { DAILY_STEP, DAILY_WEEK_BONUS, dailyReward } from "@/lib/market/rewards";
import type { marketState } from "@/lib/market/service";
import { DecoFrame, Icon } from "./ui";
import { useGame } from "./GameProvider";

export type EarnState = { daily: Awaited<ReturnType<typeof dailyState>>; invite: Awaited<ReturnType<typeof inviteState>> };
type Market = Awaited<ReturnType<typeof marketState>>;
type Paid = { reward?: number; streak?: number; weekBonus?: boolean; from?: string; souls?: number };

async function call(body: unknown): Promise<{ state?: Market; earn?: EarnState; result?: Paid; error?: string }> {
  const res = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "The market is closed. Try again." }));
}

export function EarnSouls({ initial, onPaid }: { initial: EarnState; onPaid?: (state: Market) => void }) {
  const { toast } = useGame();
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { daily, invite } = e;

  const run = async (body: unknown, after: (r: Paid) => string) => {
    if (busy) return;
    setBusy(true);
    const r = await call(body);
    setBusy(false);
    if (r.error) { toast(r.error); return; }
    if (r.earn) setE(r.earn);
    if (r.state) onPaid?.(r.state);
    if (r.result) toast(after(r.result));
  };

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/invite/${invite.token}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast("Invite link copied."); } catch { toast("Copy the link by hand."); }
  };

  return (
    <section aria-labelledby="earn-h">
      <h2 id="earn-h" className="smallcaps mb-3 text-brass">Want to earn more souls?</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <DecoFrame className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl text-paper">Daily reward</h3>
              <p className="text-sm text-ash">Come back every day: the reward grows with your streak.</p>
            </div>
            <span className="flex items-center gap-1 font-mono text-lg text-paper"><Icon name="flame" className="h-5 w-5 text-cursed" />{daily.streak}</span>
          </div>
          <p className="text-xs text-ash">
            Day 1 pays {dailyReward(1)} souls, each day {DAILY_STEP} more up to {dailyReward(10)}, and every seventh day a bonus of {DAILY_WEEK_BONUS}. Miss a day and it starts over.
          </p>
          <button
            type="button" disabled={busy || daily.claimedToday}
            onClick={() => run({ action: "daily" }, (r) => `+${r.reward} souls · day ${r.streak}${r.weekBonus ? " (weekly bonus!)" : ""}`)}
            className="mt-auto min-h-12 rounded-[3px] border border-ecto/70 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20 disabled:border-brass/20 disabled:bg-transparent disabled:text-ash"
          >
            {daily.claimedToday ? `Claimed · tomorrow +${daily.reward} souls` : `Claim +${daily.reward} souls (day ${daily.day})`}
          </button>
        </DecoFrame>

        <DecoFrame className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="font-display text-xl text-paper">Invite a friend</h3>
            <p className="text-sm text-ash">
              When a friend signs up through your link and finishes a ranked lock, you get {invite.referrerBonus} souls and they get {invite.newBonus}.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="invite-link">Your invite link</label>
            <input id="invite-link" readOnly value={link} onFocus={(ev) => ev.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-[3px] border border-brass/40 bg-ink px-3 font-mono text-xs text-paper" />
            <button type="button" onClick={copy} className="min-h-11 rounded-[3px] border border-brass/50 px-4 text-paper hover:border-brass">Copy</button>
          </div>
          <p className="text-xs text-ash">{invite.joined} of {invite.max} invitations paid · {invite.earned.toLocaleString("en-US")} souls earned</p>
          {invite.pending && (
            <div className="rounded-sm border border-ecto/40 bg-ecto/5 p-3 text-sm">
              <p className="text-paper">{invite.pending.from} invited you.</p>
              <p className="text-xs text-ash">{invite.pending.ready ? `You can claim ${invite.newBonus} souls now.` : "Finish a ranked lock while signed in first, then claim your bonus here."}</p>
              <button
                type="button" disabled={busy || !invite.pending.ready}
                onClick={() => run({ action: "redeem", token: decodeURIComponent(readRef()) }, (r) => `+${r.souls} souls from ${r.from}'s invitation`)}
                className="mt-2 min-h-10 rounded-sm border border-ecto/60 px-4 text-ecto disabled:border-brass/20 disabled:text-ash"
              >
                Claim +{invite.newBonus} souls
              </button>
            </div>
          )}
        </DecoFrame>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ash">
        <li>Locks played signed in and on their own day pay souls, and count for the leaderboards.</li>
        <li>Hard mode puzzles pay 1.5× souls.</li>
        <li>Completing sets in <a href="/inventory" className="text-brass underline-offset-4 hover:underline">your inventory</a> pays a bonus once.</li>
      </ul>
    </section>
  );
}

/** The invitation token the invite page remembered in a cookie. */
function readRef(): string {
  const m = /(?:^|; )gl_ref=([^;]*)/.exec(document.cookie);
  return m ? m[1] : "";
}
