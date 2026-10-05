// Player accounts: self-hosted Better Auth on our own database (auth_user, auth_session, auth_account, auth_verification;
// see prisma/schema.prisma). Email + password, emailed sign-in codes and password reset links (Resend), and Steam.
//
// The auth server is created lazily, on first use. Accounts are optional: a deployment without BETTER_AUTH_SECRET must
// still build and run the game.
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db";
import { config } from "../config";
import { sendResetLink, sendSignInCode } from "./mail";
import { steam } from "./steam";

/** Accounts work only when the auth secret is set (32+ characters). */
export function authConfigured(): boolean {
  return (process.env.BETTER_AUTH_SECRET ?? "").length >= 32;
}

function create() {
  const baseURL = process.env.BETTER_AUTH_URL || `https://${config.siteUrl}`;
  return betterAuth({
    appName: "GUESSLOCK",
    baseURL,
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql" }),
    user: { modelName: "authUser" },
    session: { modelName: "authSession", expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    account: { modelName: "authAccount" },
    verification: { modelName: "authVerification" },
    // Ids stay UUIDs like the accounts copied from Neon Auth.
    advanced: { database: { generateId: () => randomUUID() } },
    trustedOrigins: [baseURL, `https://${config.siteUrl}`, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:3123"])],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 15 * 60,
      sendResetPassword: async ({ user, url }) => sendResetLink(user.email, url),
    },
    plugins: [
      // Sign-in codes only for existing accounts: a new account needs a display name (the sign-up form).
      emailOTP({ disableSignUp: true, expiresIn: 5 * 60, sendVerificationOTP: async ({ email, otp }) => sendSignInCode(email, otp) }),
      steam(),
      nextCookies(), // must be last: lets server actions set the session cookie
    ],
  });
}

type Auth = ReturnType<typeof create>;
let instance: Auth | null = null;
/** The Better Auth server (handler and api). */
export const getAuth = (): Auth => (instance ??= create());

type AuthError = { message?: string; code?: string; status?: number };
/** Runs an auth call the way the forms expect it: `{ error }` instead of a thrown APIError. */
async function attempt(fn: () => Promise<unknown>): Promise<{ error: AuthError | null }> {
  try {
    await fn();
    return { error: null };
  } catch (e) {
    const err = e as { body?: { message?: string; code?: string }; message?: string; statusCode?: number; status?: number | string };
    // A redirect thrown by Next (redirect()) must pass through.
    if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    return { error: { message: err.body?.message ?? err.message, code: err.body?.code, status: err.statusCode ?? (typeof err.status === "number" ? err.status : undefined) } };
  }
}

/** The account calls the server actions use, each with this request's headers. */
export const auth = {
  signIn: {
    email: async (body: { email: string; password: string }) => attempt(async () => getAuth().api.signInEmail({ body, headers: await headers() })),
    emailOtp: async (body: { email: string; otp: string }) => attempt(async () => getAuth().api.signInEmailOTP({ body, headers: await headers() })),
  },
  signUp: {
    email: async (body: { email: string; password: string; name: string }) => attempt(async () => getAuth().api.signUpEmail({ body, headers: await headers() })),
  },
  emailOtp: {
    sendVerificationOtp: async (body: { email: string; type: "sign-in" }) => attempt(async () => getAuth().api.sendVerificationOTP({ body, headers: await headers() })),
  },
  requestPasswordReset: async (body: { email: string; redirectTo: string }) => attempt(async () => getAuth().api.requestPasswordReset({ body, headers: await headers() })),
  resetPassword: async (body: { newPassword: string; token: string }) => attempt(async () => getAuth().api.resetPassword({ body, headers: await headers() })),
  changePassword: async (body: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) =>
    attempt(async () => getAuth().api.changePassword({ body, headers: await headers() })),
  /** Steam-only players have no password yet: this sets the first one. */
  setPassword: async (newPassword: string) => attempt(async () => getAuth().api.setPassword({ body: { newPassword }, headers: await headers() })),
  updateUser: async (body: { name?: string; email?: string }) => attempt(async () => getAuth().api.updateUser({ body, headers: await headers() })),
  signOut: async () => attempt(async () => getAuth().api.signOut({ headers: await headers() })),
};

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

/** The signed-in user, or null. Never throws (auth outages or a missing setup must not break the game). */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authConfigured()) return null;
  try {
    const s = await getAuth().api.getSession({ headers: await headers() });
    const u = s?.user;
    return u ? { id: u.id, name: u.name, email: u.email, image: u.image } : null;
  } catch {
    return null;
  }
}

/** How a player can sign in: a password, Steam (with its SteamID64), a real email for codes. */
export async function signInMethods(userId: string): Promise<{ password: boolean; steamId: string | null; email: string | null }> {
  const [accounts, user] = await Promise.all([
    db.authAccount.findMany({ where: { userId }, select: { providerId: true, accountId: true } }),
    db.authUser.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  const email = user?.email && !user.email.toLowerCase().endsWith("@steam.invalid") ? user.email : null;
  return { password: accounts.some((a) => a.providerId === "credential"), steamId: accounts.find((a) => a.providerId === "steam")?.accountId ?? null, email };
}
