"use client";
// A slim bar on the Vault for signed-in players whose daily login reward is waiting.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "./GameProvider";
import { Icon } from "./ui";

type Daily = { claimedToday: boolean; streak: number; reward: number; day: number };

export function DailyReward() {
  const { user, toast } = useGame();
  const [d, setD] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/market?view=daily")
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Daily | null) => { if (live && v) setD(v); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [user]);

  if (!user || !d || d.claimedToday) return null;
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "daily" }) })
      .then((r) => r.json())
      .catch(() => ({ error: "Try again." }));
    setBusy(false);
    if (res.error) { toast(res.error); return; }
    toast(`+${res.result.reward} souls · day ${res.result.streak}${res.result.weekBonus ? " (weekly bonus!)" : ""}`);
    setD({ ...d, claimedToday: true });
  };
  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-sm border border-ecto/40 bg-ecto/5 px-4 py-2 text-sm">
      <span className="flex items-center gap-1.5 text-paper">
        <Icon name="flame" className="h-4 w-4 text-cursed" />
        Daily reward ready{d.streak > 0 ? ` · ${d.streak} day streak` : ""}
      </span>
      <button type="button" onClick={claim} disabled={busy} className="min-h-10 rounded-sm border border-ecto/70 bg-ecto/10 px-4 text-ecto hover:bg-ecto/20 disabled:opacity-50">
        Claim +{d.reward} souls
      </button>
      <Link href="/market" className="text-xs text-ash underline-offset-4 hover:text-paper hover:underline">More ways to earn souls</Link>
    </div>
  );
}
