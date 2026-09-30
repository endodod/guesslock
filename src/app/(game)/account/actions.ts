"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@/lib/auth/server";
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
  await requireUser();
  const newPassword = String(f.get("newPassword") ?? "");
  if (newPassword.length < 8) return { error: "Use at least 8 characters for the new password." };
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
