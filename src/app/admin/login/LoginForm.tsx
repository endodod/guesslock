"use client";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">Password</span>
        <input name="password" type="password" autoFocus required autoComplete="current-password" className="w-full border px-3 py-2" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">{error}</p>}
      <button disabled={pending} className="w-full bg-neutral-900 px-4 py-2.5 text-white disabled:opacity-50">{pending ? "Checking…" : "Log in"}</button>
    </form>
  );
}
