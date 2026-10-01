// Neon Auth (Managed Better Auth). Users and sessions live in the neon_auth schema.
//
// The auth client is created lazily, on first use. Accounts are optional: a deployment without
// NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET must still build and run the game (creating the client
// at import time threw "Missing required config" and failed the whole build).
import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;

/** Accounts work only when both settings exist (the cookie secret must be 32+ characters). */
export function authConfigured(): boolean {
  return !!process.env.NEON_AUTH_BASE_URL && (process.env.NEON_AUTH_COOKIE_SECRET ?? "").length >= 32;
}

let instance: NeonAuth | null = null;
function create(): NeonAuth {
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}

/** Same API as createNeonAuth()'s result; the real client is built when a property is first read. */
export const auth: NeonAuth = new Proxy({} as NeonAuth, {
  get: (_target, prop) => Reflect.get(create(), prop),
});

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

/** The signed-in user, or null. Never throws (auth outages or a missing setup must not break the game). */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authConfigured()) return null;
  try {
    const { data } = await auth.getSession();
    const u = data?.user;
    return u ? { id: u.id, name: u.name, email: u.email, image: u.image } : null;
  } catch {
    return null;
  }
}
