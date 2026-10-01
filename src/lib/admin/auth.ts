// Password-protected admin: HMAC-signed session cookie (no accounts in v1).
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { config } from "../config";

const COOKIE = "gl_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret(): string {
  if (!config.sessionSecret || config.sessionSecret.length < 16) throw new Error("SESSION_SECRET must be set (16+ chars)");
  return config.sessionSecret;
}

/** Sessions are bound to the current password: changing ADMIN_PASSWORD signs every admin out. */
function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`${payload}|${config.adminPassword}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  if (!config.adminPassword) return false;
  const a = createHmac("sha256", "pw").update(input).digest();
  const b = createHmac("sha256", "pw").update(config.adminPassword).digest();
  return timingSafeEqual(a, b);
}

export async function createSession() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  try {
    return safeEqual(sig, sign(exp));
  } catch {
    return false;
  }
}

/** For admin pages: redirect to login. */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** For server actions: throw. */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

/** Puzzle setup pages (/admin/setup): admin session and ADMIN_SETUP_MODE on, else 404. */
export async function requireSetupPage() {
  if (!config.adminSetup) notFound();
  await requireAdminPage();
}

/** Puzzle setup server actions. */
export async function requireSetup() {
  if (!config.adminSetup) throw new Error("Puzzle setup mode is off (ADMIN_SETUP_MODE)");
  await requireAdmin();
}

/** For cron route handlers: Authorization: Bearer CRON_SECRET (header only: a secret in the URL ends up in logs). */
export function checkCronAuth(req: Request): boolean {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return !!config.cronSecret && config.cronSecret.length >= 16 && safeEqual(token, config.cronSecret);
}
