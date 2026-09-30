"use client";
import { useActionState, useState, useTransition } from "react";
import { changePassword, deleteAccount, setVisibility, updateName, type AccountState } from "@/app/(game)/account/actions";
import { DecoFrame } from "./ui";

const input =
  "min-h-11 w-full rounded-[3px] border border-brass/50 bg-ink/80 px-3 text-paper placeholder:text-ash focus:border-ecto focus:outline-none focus-visible:outline-none";
const btn = "min-h-11 rounded-[3px] border border-brass bg-brass/10 px-4 text-brass hover:bg-brass/20 disabled:opacity-50";

function Msg({ s }: { s: AccountState }) {
  if (!s) return null;
  return s.error ? <p role="alert" className="text-sm text-[#e6a3a0]">{s.error}</p> : <p role="status" className="text-sm text-ecto">{s.ok}</p>;
}

export function AccountForms({ name, showOnBoards }: { name: string; showOnBoards: boolean }) {
  const [nameState, nameAction, namePending] = useActionState(updateName, null);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, null);
  const [delState, delAction, delPending] = useActionState(deleteAccount, null);
  const [visible, setVisible] = useState(showOnBoards);
  const [visPending, startVis] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-6">
      <DecoFrame className="space-y-4 p-5" corners={false}>
        <h2 className="smallcaps text-brass">Profile</h2>
        <form action={nameAction} className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm text-ash">Display name (shown on leaderboards)</span>
            <input name="name" defaultValue={nameState?.value ?? name} minLength={3} maxLength={20} required className={input} />
          </label>
          <button disabled={namePending} className={btn}>Save</button>
        </form>
        <Msg s={nameState} />
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span>
            Appear on the leaderboards
            <span className="block text-xs text-ash">When off, your name is hidden from everyone, including the rankings you see.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            disabled={visPending}
            onClick={() => { const v = !visible; setVisible(v); startVis(() => setVisibility(v)); }}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${visible ? "border-ecto bg-ecto/30" : "border-ash/50 bg-ink"}`}
          >
            <span className={`absolute top-0.5 rounded-full transition-all ${visible ? "left-[1.4rem] bg-ecto" : "left-0.5 bg-ash"}`} style={{ height: 22, width: 22 }} />
          </button>
        </label>
      </DecoFrame>

      <DecoFrame className="space-y-4 p-5" corners={false}>
        <h2 className="smallcaps text-brass">Password</h2>
        <form action={pwAction} className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-sm text-ash">Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required className={input} /></label>
          <label><span className="mb-1 block text-sm text-ash">New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={8} required className={input} /></label>
          <div className="sm:col-span-2"><button disabled={pwPending} className={btn}>Change password</button></div>
        </form>
        <Msg s={pwState} />
        <p className="text-xs text-ash">Signed up with a code only? Use &quot;Forgot your password?&quot; on the sign-in page to set one.</p>
      </DecoFrame>

      <DecoFrame className="space-y-3 p-5" corners={false}>
        <h2 className="smallcaps text-brass">Your data</h2>
        <p className="text-sm text-ash">We store your email, display name and the puzzles you played while signed in. Nothing else.</p>
        <a href="/api/account/export" className={`${btn} inline-flex items-center`}>Download my data (JSON)</a>
        <div className="border-t border-brass/15 pt-4">
          {!confirmOpen ? (
            <button type="button" onClick={() => setConfirmOpen(true)} className="min-h-11 rounded-[3px] border border-[#b0433f]/60 px-4 text-[#e6a3a0]">Delete my account</button>
          ) : (
            <form action={delAction} className="space-y-3">
              <p className="text-sm text-paper">This permanently deletes your account, souls, streaks and leaderboard history. Progress stored in this browser stays.</p>
              <label className="block">
                <span className="mb-1 block text-sm text-ash">Type your display name <strong className="text-paper">{name}</strong> to confirm</span>
                <input name="confirm" autoComplete="off" required className={input} />
              </label>
              <div className="flex gap-2">
                <button disabled={delPending} className="min-h-11 rounded-[3px] border border-[#b0433f] bg-velvet px-4 text-paper disabled:opacity-50">Delete forever</button>
                <button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 px-4 text-ash">Cancel</button>
              </div>
              <Msg s={delState} />
            </form>
          )}
        </div>
      </DecoFrame>
    </div>
  );
}
