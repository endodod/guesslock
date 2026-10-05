"use server";
// Auth flows (Neon Auth / Managed Better Auth) as server actions. Session cookies are set by the SDK.
import { safeNextPath } from "@/lib/auth/redirect";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { config } from "@/lib/config";
import { auth, currentUser } from "@/lib/auth/server";
import { throttle, TOO_MANY } from "@/lib/auth/throttle";
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
  if (m.includes("too_many_attempts")) return "Too many wrong codes. Ask for a new one.";
  if (m.includes("user_not_found") || m.includes("user not found")) return "No account uses that email address. Check the spelling, or sign up.";
  if (m.includes("too many") || err?.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("invalid email")) return "That email address doesn't look right.";
  return err?.message || fallback;
}

async function afterSignIn() {
  const user = await currentUser();
  if (user) await ensureProfile(user);
}

export async function signIn(_prev: FormState, f: FormData): Promise<FormState> {
  if (await throttle.signIn(str(f, "email"))) return { error: TOO_MANY, values: values(f) };
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
  if (await throttle.signUp()) return { error: TOO_MANY, values: values(f) };
  const { error } = await auth.signUp.email({ email: str(f, "email"), password, name });
  if (error) return { error: friendly(error, "Could not create the account."), values: values(f) };
  await afterSignIn();
  redirect(safeNext(f));
}

export async function sendSignInCode(_prev: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (str(f, "otp")) {
    if (await throttle.code(email)) return { error: TOO_MANY, stage: "code", email };
    const { error } = await auth.signIn.emailOtp({ email, otp: str(f, "otp") });
    if (error) return { error: friendly(error, "That code didn't work."), stage: "code", email };
    await afterSignIn();
    redirect(safeNext(f));
  }
  if (await throttle.mail(email)) return { error: TOO_MANY, values: values(f) };
  const { error } = await auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  if (error) return { error: friendly(error, "Could not send a code."), values: values(f) };
  return { stage: "code", email, ok: `A code is on its way to ${email}.` };
}

/**
 * Forgot password, step 1: email a reset link. (Neon Auth's reset-by-code step answered "user not found" for real accounts
 * after accepting the code, so the reset uses the link flow its docs describe.) The link comes back to /auth/reset?token=….
 */
export async function resetPassword(_prev: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (!email) return { error: "Enter your email address.", values: values(f) };
  if (await throttle.mail(email)) return { error: TOO_MANY, values: values(f) };
  const { error } = await auth.requestPasswordReset({ email, redirectTo: `${await siteOrigin()}/auth/reset` });
  if (error) {
    console.error("[auth] password reset link not sent", { code: (error as { code?: string }).code, status: (error as { status?: number }).status, message: error.message });
    return { error: friendly(error, "Could not send the link."), values: values(f) };
  }
  return { ok: `If an account exists for ${email}, a reset link is on its way. It works for 15 minutes.`, values: values(f) };
}

/** Forgot password, step 2 (the page the emailed link opens): set the new password with the link's token. */
export async function setNewPassword(_prev: FormState, f: FormData): Promise<FormState> {
  const token = str(f, "token");
  const password = String(f.get("password") ?? "");
  if (!token) return { error: "This reset link is incomplete. Ask for a new one." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (await throttle.reset()) return { error: TOO_MANY };
  const { error } = await auth.resetPassword({ newPassword: password, token });
  if (error) {
    console.error("[auth] password reset failed", { code: (error as { code?: string }).code, status: (error as { status?: number }).status, message: error.message });
    const m = `${(error as { code?: string }).code ?? ""} ${error.message ?? ""}`.toLowerCase();
    return { error: m.includes("token") ? "This reset link has expired or was already used. Ask for a new one." : friendly(error, "Could not reset the password.") };
  }
  return { ok: "Password changed. Sign in with your new password.", stage: "code" };
}

/**
 * Where emailed links should come back to: this request's own origin when it is this site (or, in development, a local
 * dev server, so localhost links stay local), else the site. The headers are the client's to choose, and a direct
 * Better Auth call doesn't check the redirect itself, so an unknown origin never ends up in a reset email.
 */
async function siteOrigin(): Promise<string> {
  const site = `https://${config.siteUrl}`;
  const trusted = [site, process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : site];
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : "");
  const local = process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return local || trusted.includes(origin) ? origin : site;
}

export async function signOut() {
  await auth.signOut();
  redirect("/");
}
