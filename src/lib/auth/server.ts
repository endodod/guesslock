// Neon Auth (Managed Better Auth). Users and sessions live in the neon_auth schema.
import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

/** The signed-in user, or null. Never throws (auth outages must not break the game). */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const { data } = await auth.getSession();
    const u = data?.user;
    return u ? { id: u.id, name: u.name, email: u.email, image: u.image } : null;
  } catch {
    return null;
  }
}
