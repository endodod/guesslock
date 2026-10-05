"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth, currentUser, getAuth, signInMethods } from "@/lib/auth/server";
import { finishAddEmail, startAddEmail } from "@/lib/auth/add-email";
import { db } from "@/lib/db";
import { deleteAccountCompletely, ensureProfile, setDisplayName } from "@/lib/accounts/service";

/** `value` echoes the typed name back, since React resets the form after the action. */
export type AccountState = { error?: string; ok?: string; value?: string } | null;

async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/auth/sign-in?next=/account");
  await ensureProfile(user);
  return user;
}

export async function updateName(_prev: AccountState, f: FormData): Promise<AccountState> {
  const user = await requireUser();
  const typed = String(f.get("name") ?? "");
  const error = await setDisplayName(user.id, typed);
  if (error) return { error, value: typed };
  await auth.updateUser({ name: typed.trim() }).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: "Name saved.", value: typed.trim() };
}

export async function setVisibility(show: boolean) {
  const user = await requireUser();
  await db.profile.update({ where: { userId: user.id }, data: { showOnBoards: show } });
  revalidatePath("/account");
  revalidatePath("/hall");
}

export async function changePassword(_prev: AccountState, f: FormData): Promise<AccountState> {
  const user = await requireUser();
  const newPassword = String(f.get("newPassword") ?? "");
  if (newPassword.length < 8) return { error: "Use at least 8 characters for the new password." };
  // Signed up with Steam or codes only: there is no current password, this sets the first one.
  if (!(await signInMethods(user.id)).password) {
    const { error } = await auth.setPassword(newPassword);
    if (error) return { error: error.message || "Could not set the password." };
    revalidatePath("/account");
    return { ok: "Password set. You can now sign in with your email and this password." };
  }
  const { error } = await auth.changePassword({
    currentPassword: String(f.get("currentPassword") ?? ""),
    newPassword,
    revokeOtherSessions: true,
  });
  if (error) return { error: /invalid|incorrect/i.test(error.message ?? "") ? "The current password is wrong." : error.message || "Could not change the password." };
  return { ok: "Password changed. Other devices were signed out." };
}

export async function deleteAccount(_prev: AccountState, f: FormData): Promise<AccountState> {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (String(f.get("confirm") ?? "").trim() !== profile?.displayName) return { error: "Type your display name exactly to confirm." };
  try {
    await deleteAccountCompletely(user.id);
  } catch {
    return { error: "Could not delete the account. Nothing was removed; try again later." };
  }
  await auth.signOut().catch(() => undefined); // clears this browser's session cookies
  redirect("/?deleted=1");
}

/** Steam: remove the link (Better Auth's endpoint refuses when Steam is the only way to sign in). */
export async function unlinkSteam(): Promise<AccountState> {
  await requireUser();
  try {
    await getAuth().api.steamUnlink({ headers: await headers() });
  } catch (e) {
    return { error: (e as { body?: { message?: string } }).body?.message ?? "Could not unlink Steam." };
  }
  revalidatePath("/account");
  return { ok: "Steam unlinked." };
}

/** Steam-only players: add an email address, proven with a code sent to it. */
export async function addEmail(_prev: AccountState, f: FormData): Promise<AccountState> {
  const user = await requireUser();
  const code = String(f.get("code") ?? "").trim();
  const email = String(f.get("email") ?? "").trim();
  if (!code) {
    const error = await startAddEmail(user.id, email).catch(() => "Could not send the code. Try again later.");
    return error ? { error, value: email } : { ok: `A code is on its way to ${email}.`, value: email };
  }
  const r = await finishAddEmail(user.id, code);
  if ("error" in r) return { error: r.error, value: email };
  revalidatePath("/account");
  return { ok: `Email saved: ${r.email}. Set a password below to sign in with it, or use sign-in codes.` };
}
