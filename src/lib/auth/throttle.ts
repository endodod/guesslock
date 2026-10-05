// Rate limits for the account server actions. They call Better Auth's api directly, which skips both Better Auth's own
// rate limiter (it only runs for requests through its HTTP handler) and the /api/auth route's throttle, so every action
// counts its attempts here, in the shared store (holds across server instances).
import { headers } from "next/headers";
import { clientIpFrom } from "../server/ratelimit";
import { rateLimitShared } from "../server/sharedlimit";

const MIN = 60_000;
export const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

/** Counts one attempt against each limit; true when any of them is exceeded. */
async function over(limits: [key: string, max: number, windowMs: number][]): Promise<boolean> {
  const results = await Promise.all(limits.map(([key, max, windowMs]) => rateLimitShared(key, max, windowMs)));
  return results.some((r) => !r.ok);
}

const ip = async () => clientIpFrom(await headers());
const norm = (email: string) => email.trim().toLowerCase().slice(0, 200);

export const throttle = {
  /** Password sign-in: per address, and per account so a botnet can't spread guesses at one password. */
  signIn: async (email: string) => over([[`signin-ip:${await ip()}`, 10, MIN], [`signin-to:${norm(email)}`, 20, 10 * MIN]]),
  signUp: async () => over([[`signup:${await ip()}`, 5, 60 * MIN]]),
  /** Anything that sends an email (sign-in code, reset link, add-email code): caps Resend usage per sender and per inbox. */
  mail: async (email: string) => over([[`mail-ip:${await ip()}`, 5, 10 * MIN], [`mail-to:${norm(email)}`, 3, 10 * MIN]]),
  /** Entering an emailed sign-in code. */
  code: async (email: string) => over([[`code-ip:${await ip()}`, 10, 10 * MIN], [`code-to:${norm(email)}`, 10, 10 * MIN]]),
  /** Setting a new password with a reset link's token. */
  reset: async () => over([[`reset:${await ip()}`, 10, 10 * MIN]]),
  /** Changing a signed-in account's password (guessing the current one). */
  password: (userId: string) => over([[`password:${userId}`, 5, 10 * MIN]]),
};
