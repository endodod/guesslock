"use server";
// Auth flows (Neon Auth / Managed Better Auth) as server actions. Session cookies are set by the SDK.
import { safeNextPath } from "@/lib/auth/redirect";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/accounts/service";
import { validateDisplayName, nameKey } from "@/lib/accounts/rules";
import { db } from "@/lib/db";

/**
 * `values` echoes the non-secret fields back: React resets a form after its action runs,
 * so without this a failed attempt would also wipe the email and name.
 */
export type FormState = {
  error?: string;
  ok?: string;
  stage?: "code";
  email?: string;
  values?: { email?: string; name?: string };
} | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const values = (f: FormData) => ({ email: str(f, "email"), name: str(f, "name") });

/** Only same-site relative paths, so `next` can't redirect off-site. */
function safeNext(f: FormData): string {
  return safeNextPath(str(f, "next"), ["/auth"]);
}

function friendly(err: { message?: string; code?: string; status?: number } | null | undefined, fallback: string): string {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (m.includes("invalid email or password") || m.includes("invalid_credentials") || m.includes("invalid_email_or_password")) return "Wrong email or password.";
  if (m.includes("already exists") || m.includes("user_already_exists")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("password") && (m.includes("short") || m.includes("too_short"))) return "Use at least 8 characters for the password.";
  if (m.includes("otp") && (m.includes("invalid") || m.includes("expired"))) return "That code is wrong or has expired.";
  if (m.includes("too many") || err?.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("invalid email")) return "That email address doesn't look right.";
  return err?.message || fallback;
}

async function afterSignIn() {
  const user = await currentUser();
  if (user) await ensureProfile(user);
}

export async function signIn(_prev: FormState, f: FormData): Promise<FormState> {
  const { error } = await auth.signIn.email({ email: str(f, "email"), password: String(f.get("password") ?? "") });
  if (error) return { error: friendly(error, "The lock won't turn. Try again."), values: values(f) };
  await afterSignIn();
  redirect(safeNext(f));
}

export async function signUp(_prev: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name");
  const nameErr = validateDisplayName(name);
  if (nameErr) return { error: `Name: ${nameErr}`, values: values(f) };
  if (await db.profile.findUnique({ where: { nameKey: nameKey(name) } })) return { error: "That name is taken.", values: values(f) };
  const password = String(f.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for the password.", values: values(f) };
  const { error } = await auth.signUp.email({ email: str(f, "email"), password, name });
  if (error) return { error: friendly(error, "Could not create the account."), values: values(f) };
  await afterSignIn();
  redirect(safeNext(f));
}

export async function sendSignInCode(_prev: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (str(f, "otp")) {
    const { error } = await auth.signIn.emailOtp({ email, otp: str(f, "otp") });
    if (error) return { error: friendly(error, "That code didn't work."), stage: "code", email };
    await afterSignIn();
    redirect(safeNext(f));
  }
  const { error } = await auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  if (error) return { error: friendly(error, "Could not send a code."), values: values(f) };
  return { stage: "code", email, ok: `A code is on its way to ${email}.` };
}

export async function resetPassword(_prev: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (str(f, "otp")) {
    const password = String(f.get("password") ?? "");
    if (password.length < 8) return { error: "Use at least 8 characters for the password.", stage: "code", email };
    const { error } = await auth.emailOtp.resetPassword({ email, otp: str(f, "otp"), password });
    if (error) return { error: friendly(error, "Could not reset the password."), stage: "code", email };
    const { error: signInError } = await auth.signIn.email({ email, password });
    if (!signInError) {
      await afterSignIn();
      redirect("/account");
    }
    redirect("/auth/sign-in");
  }
  const { error } = await auth.emailOtp.sendVerificationOtp({ email, type: "forget-password" });
  if (error) return { error: friendly(error, "Could not send a code."), values: values(f) };
  return { stage: "code", email, ok: `If an account exists for ${email}, a code is on its way.` };
}

export async function signOut() {
  await auth.signOut();
  redirect("/");
}
