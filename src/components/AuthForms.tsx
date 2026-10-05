"use client";
// Sign-in / sign-up / code / reset forms, styled like the vault.
import Link from "next/link";
import { useActionState } from "react";
import { resetPassword, sendSignInCode, setNewPassword, signIn, signUp, type FormState } from "@/app/(game)/auth/actions";
import { DecoFrame, Keyhole } from "./ui";

const input =
  "min-h-12 w-full rounded-[3px] border border-brass/50 bg-ink/80 px-3 text-[1.05rem] text-paper placeholder:text-ash focus:border-ecto focus:outline-none focus-visible:outline-none";

function Field(props: { label: string; name: string; type?: string; autoComplete?: string; defaultValue?: string; hint?: string; minLength?: number; maxLength?: number; inputMode?: "numeric" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ash">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required
        autoComplete={props.autoComplete}
        defaultValue={props.defaultValue}
        minLength={props.minLength}
        maxLength={props.maxLength}
        inputMode={props.inputMode}
        className={input}
      />
      {props.hint && <span className="mt-1 block text-xs text-ash">{props.hint}</span>}
    </label>
  );
}

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <DecoFrame className="p-6 md:p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <Keyhole className="mb-3 h-10 w-7 text-brass" />
          <h1 className="font-display text-2xl text-brass">{title}</h1>
          <p className="mt-1 text-sm text-ash">{sub}</p>
        </div>
        {children}
      </DecoFrame>
    </div>
  );
}

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <>
      {state.ok && <p role="status" className="rounded-sm border border-ecto/40 bg-ecto/10 px-3 py-2 text-sm text-ecto">{state.ok}</p>}
      {state.error && <p role="alert" className="rounded-sm border border-[#b0433f]/60 bg-velvet px-3 py-2 text-sm text-paper">{state.error}</p>}
    </>
  );
}

function Submit({ pending, label, busy }: { pending: boolean; label: string; busy: string }) {
  return (
    <button disabled={pending} className="min-h-12 w-full rounded-[3px] border border-ecto/70 bg-ecto/10 text-lg text-ecto hover:bg-ecto/20 disabled:opacity-50">
      {pending ? busy : label}
    </button>
  );
}

const link = "text-brass underline-offset-4 hover:underline";

/** Steam's sign-in page (OpenID), back to `next` afterwards. New players get an account named after their Steam profile. */
function SteamButton({ next, label }: { next: string; label: string }) {
  return (
    <>
      <a
        href={`/api/auth/steam/start?mode=login&next=${encodeURIComponent(next)}`}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[3px] border border-[#66c0f4]/60 bg-[#171a21] text-[1.05rem] text-[#c7d5e0] hover:border-[#66c0f4]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="15" cy="9.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="9" cy="15" r="1.8" fill="currentColor" /><path d="M9 15l4.5-3.5" stroke="currentColor" strokeWidth="1.5" /></svg>
        {label}
      </a>
      <div className="my-4 flex items-center gap-3 text-xs text-ash"><span className="h-px flex-1 bg-brass/20" />or<span className="h-px flex-1 bg-brass/20" /></div>
    </>
  );
}

export function SignInForm({ next, adminLink = false, steamError }: { next: string; adminLink?: boolean; steamError?: "failed" | "expired" }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <Shell title="Sign the register" sub="Sign in to keep your souls, streaks and place on the leaderboards.">
      {steamError && <p role="alert" className="mb-4 rounded-sm border border-[#b0433f]/60 bg-velvet px-3 py-2 text-sm text-paper">{steamError === "failed" ? "Steam didn't confirm the sign-in. Try again." : "That Steam sign-in took too long. Try again."}</p>}
      <SteamButton next={next} label="Sign in with Steam" />
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <Status state={state} />
        <Submit pending={pending} label="Sign in" busy="Turning the key…" />
      </form>
      {adminLink && (
        <Link href="/admin/login" className="mt-3 flex min-h-12 w-full items-center justify-center rounded-[3px] border border-brass/50 text-brass hover:bg-brass/10">
          Admin login
        </Link>
      )}
      <div className="mt-3 text-center text-sm">
        <p><Link className={`${link} inline-flex min-h-11 items-center`} href={`/auth/code?next=${encodeURIComponent(next)}`}>Email me a sign-in code instead</Link></p>
        <p><Link className={`${link} inline-flex min-h-11 items-center`} href="/auth/reset">Forgot your password?</Link></p>
        <p className="text-ash">New here? <Link className={link} href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      </div>
    </Shell>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  return (
    <Shell title="Join the register" sub="Your progress on this device comes with you. Accounts are optional; the game works without one.">
      <SteamButton next={next} label="Sign up with Steam" />
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Display name" name="name" autoComplete="nickname" minLength={3} maxLength={20} defaultValue={state?.values?.name} hint="Shown on the leaderboards. 3–20 characters." />
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} hint="Only used for sign-in codes and password resets." />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <Status state={state} />
        <Submit pending={pending} label="Create account" busy="Engraving your name…" />
      </form>
      <p className="mt-5 text-center text-sm text-ash">
        Already registered? <Link className={link} href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </Shell>
  );
}

export function CodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendSignInCode, null);
  const codeStage = state?.stage === "code";
  return (
    <Shell title="Sign in with a code" sub="We email you a one-time code. No password needed.">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {codeStage ? (
          <>
            <input type="hidden" name="email" value={state?.email} />
            <Field label="Code from the email" name="otp" autoComplete="one-time-code" inputMode="numeric" maxLength={10} />
          </>
        ) : (
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
        )}
        <Status state={state} />
        <Submit pending={pending} label={codeStage ? "Sign in" : "Send code"} busy="…" />
      </form>
      <p className="mt-5 text-center text-sm"><Link className={link} href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Use a password instead</Link></p>
    </Shell>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(resetPassword, null);
  return (
    <Shell title="Reset your password" sub="We email you a link; open it to choose a new password.">
      <form action={action} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
        <Status state={state} />
        <Submit pending={pending} label={state?.ok ? "Send the link again" : "Send reset link"} busy="…" />
      </form>
      <p className="mt-5 text-center text-sm"><Link className={link} href="/auth/sign-in">Back to sign in</Link></p>
    </Shell>
  );
}

/** The page an emailed reset link opens (/auth/reset?token=…). */
export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setNewPassword, null);
  const done = state?.stage === "code" && !!state.ok;
  return (
    <Shell title="Choose a new password" sub="Pick a new password for your account.">
      {done ? (
        <div className="space-y-4">
          <Status state={state} />
          <p className="text-center"><Link className={link} href="/auth/sign-in">Sign in</Link></p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
          <Status state={state} />
          <Submit pending={pending} label="Set new password" busy="…" />
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link className={link} href="/auth/reset">Ask for a new link</Link></p>
    </Shell>
  );
}
