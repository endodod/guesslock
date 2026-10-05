// Steam-only players can add an email address (for sign-in codes and a password). The address is proven with a code
// sent to it first, so no one can claim someone else's email.
import { createHash, randomInt, randomUUID } from "node:crypto";
import { db } from "../db";
import { sendSignInCode } from "./mail";
import { isPlaceholderEmail } from "./steam";

const TTL_MS = 10 * 60_000;
const id = (userId: string) => `add-email:${userId}`;
const hash = (code: string, userId: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

/** Step 1: send a code to the new address. Returns an error message or null. */
export async function startAddEmail(userId: string, rawEmail: string): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || isPlaceholderEmail(email)) return "That email address doesn't look right.";
  const user = await db.authUser.findUnique({ where: { id: userId } });
  if (!user || !isPlaceholderEmail(user.email)) return "Your account already has an email address.";
  if (await db.authUser.findUnique({ where: { email } })) return "Another account uses that email address.";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.authVerification.deleteMany({ where: { identifier: id(userId) } });
  await db.authVerification.create({
    data: { id: randomUUID(), identifier: id(userId), value: JSON.stringify({ email, hash: hash(code, userId), tries: 0 }), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  await sendSignInCode(email, code);
  return null;
}

/** Step 2: check the code and set the address. Returns the email, or an error message. */
export async function finishAddEmail(userId: string, code: string): Promise<{ email: string } | { error: string }> {
  const row = await db.authVerification.findFirst({ where: { identifier: id(userId) } });
  if (!row || row.expiresAt < new Date()) return { error: "That code has expired. Ask for a new one." };
  const v = JSON.parse(row.value) as { email: string; hash: string; tries: number };
  if (v.hash !== hash(code.trim(), userId)) {
    if (v.tries >= 4) await db.authVerification.delete({ where: { id: row.id } });
    else await db.authVerification.update({ where: { id: row.id }, data: { value: JSON.stringify({ ...v, tries: v.tries + 1 }) } });
    return { error: v.tries >= 4 ? "Too many wrong codes. Ask for a new one." : "That code is wrong." };
  }
  if (await db.authUser.findUnique({ where: { email: v.email } })) return { error: "Another account uses that email address." };
  await db.$transaction([
    db.authUser.update({ where: { id: userId }, data: { email: v.email, emailVerified: true } }),
    db.authVerification.delete({ where: { id: row.id } }),
  ]);
  return { email: v.email };
}
