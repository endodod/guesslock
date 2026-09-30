"use client";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm">Password</span>
        <input name="password" type="password" autoFocus required className="w-full rounded border border-neutral-400 px-2 py-1.5" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="rounded bg-neutral-900 px-4 py-1.5 text-white disabled:opacity-50">Log in</button>
    </form>
  );
}
