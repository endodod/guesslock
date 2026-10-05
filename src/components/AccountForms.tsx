"use client";
import { useActionState, useState, useTransition } from "react";
import { addEmail, changePassword, deleteAccount, setVisibility, unlinkSteam, updateName, type AccountState } from "@/app/(game)/account/actions";
import { DecoFrame } from "./ui";

const input =
  "min-h-11 w-full rounded-[3px] border border-brass/50 bg-ink/80 px-3 text-paper placeholder:text-ash focus:border-ecto focus:outline-none focus-visible:outline-none";
const btn = "min-h-11 rounded-[3px] border border-brass bg-brass/10 px-4 text-brass hover:bg-brass/20 disabled:opacity-50";

function Msg({ s }: { s: AccountState }) {
  if (!s) return null;
  return s.error ? <p role="alert" className="text-sm text-[#e6a3a0]">{s.error}</p> : <p role="status" className="text-sm text-ecto">{s.ok}</p>;
}

const STEAM_NOTE: Record<string, AccountState> = {
  linked: { ok: "Steam is linked: you can sign in with it from now on." },
  taken: { error: "That Steam account is already linked to another GUESSLOCK account." },
  already: { error: "Your account is already linked to a Steam account. Unlink it first." },
  failed: { error: "Steam didn't confirm the sign-in. Try again." },
  expired: { error: "That Steam sign-in took too long. Try again." },
};

export type SignInMethods = { password: boolean; steamId: string | null; email: string | null };

export function AccountForms({ name, showOnBoards, methods, steamStatus }: { name: string; showOnBoards: boolean; methods: SignInMethods; steamStatus?: string }) {
  const [nameState, nameAction, namePending] = useActionState(updateName, null);
  const [emailState, emailAction, emailPending] = useActionState(addEmail, null);
  const [steamState, setSteamState] = useState<AccountState>(steamStatus ? STEAM_NOTE[steamStatus] ?? null : null);
  const [steamPending, startSteam] = useTransition();
  const codeSent = !!emailState?.ok && !methods.email && emailState.ok.startsWith("A code");
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
        <h2 className="smallcaps text-brass">Linked accounts</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            <span className="text-paper">Steam</span>{" "}
            {methods.steamId ? (
              <a className="text-sm text-brass underline-offset-4 hover:underline" href={`https://steamcommunity.com/profiles/${methods.steamId}`} target="_blank" rel="noreferrer">linked ({methods.steamId})</a>
            ) : <span className="text-sm text-ash">not linked</span>}
          </p>
          {methods.steamId ? (
            <button type="button" disabled={steamPending} onClick={() => startSteam(async () => setSteamState(await unlinkSteam()))} className="min-h-11 rounded-[3px] border border-ash/40 px-4 text-paper hover:border-[#b0433f] disabled:opacity-50">Unlink Steam</button>
          ) : (
            // A full navigation: the API route redirects to Steam.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/api/auth/steam/start?mode=link" className={`${btn} inline-flex items-center`}>Link Steam</a>
          )}
        </div>
        <Msg s={steamState} />
        {!methods.email && (
          <form action={emailAction} className="space-y-3 border-t border-brass/15 pt-4">
            <p className="text-sm text-ash">Add an email address to sign in with codes or a password as well as Steam. We send a code to prove it&apos;s yours.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-sm text-ash">Email</span>
                <input name="email" type="email" autoComplete="email" defaultValue={emailState?.value} required readOnly={codeSent} className={input} />
              </label>
              {codeSent && (
                <label className="w-36">
                  <span className="mb-1 block text-sm text-ash">Code</span>
                  <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={input} />
                </label>
              )}
              <button disabled={emailPending} className={btn}>{codeSent ? "Confirm" : "Send code"}</button>
            </div>
            <Msg s={emailState} />
          </form>
        )}
      </DecoFrame>

      <DecoFrame className="space-y-4 p-5" corners={false}>
        <h2 className="smallcaps text-brass">Password</h2>
        <form action={pwAction} className="grid gap-3 sm:grid-cols-2">
          {methods.password ? (
            <label><span className="mb-1 block text-sm text-ash">Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required className={input} /></label>
          ) : (
            <p className="text-sm text-ash sm:col-span-2">{methods.email ? "You don't have a password yet. Set one to sign in with your email and password." : "Add an email address above first: a password signs in together with your email."}</p>
          )}
          <label><span className="mb-1 block text-sm text-ash">New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={8} required className={input} /></label>
          <div className="sm:col-span-2"><button disabled={pwPending || (!methods.password && !methods.email)} className={btn}>{methods.password ? "Change password" : "Set password"}</button></div>
        </form>
        <Msg s={pwState} />
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
