// "Sign in through Steam" for Better Auth. Steam speaks OpenID 2.0, which isn't one of Better Auth's OAuth providers, so
// this plugin adds the three endpoints itself:
//   GET  /api/auth/steam/start?mode=login|link&next=/path  -> redirects to Steam
//   GET  /api/auth/steam/callback                          -> verifies Steam's answer, then signs in or links
//   POST /api/auth/steam/unlink                            -> removes the Steam link (only if another way to sign in is left)
// A Steam account is an AuthAccount row { providerId: "steam", accountId: SteamID64 }. A Steam-only player gets a placeholder
// email (<steamid>@steam.invalid) that is never written to.
import { randomBytes } from "node:crypto";
import * as z from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { safeNextPath } from "./redirect";
import { ensureProfile } from "../accounts/service";

export const STEAM_PROVIDER = "steam";
const OPENID = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const STATE_COOKIE = "gl_steam_state";
const PLACEHOLDER_DOMAIN = "steam.invalid";

export const isPlaceholderEmail = (email: string) => email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);

type State = { nonce: string; mode: "login" | "link"; next: string; userId?: string };

/** The Steam login URL for a callback (OpenID 2.0 checkid_setup with identifier_select). */
export function steamLoginUrl(returnTo: string, realm: string): string {
  const q = new URLSearchParams({
    "openid.ns": NS, "openid.mode": "checkid_setup", "openid.return_to": returnTo, "openid.realm": realm,
    "openid.identity": `${NS}/identifier_select`, "openid.claimed_id": `${NS}/identifier_select`,
  });
  return `${OPENID}?${q}`;
}

/**
 * Checks a callback with Steam itself (check_authentication) and returns the SteamID64, or null. The answer must come back
 * to our own callback URL and name a Steam identity.
 */
export async function verifySteam(query: Record<string, string>, callbackUrl: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (query["openid.mode"] !== "id_res" || query["openid.op_endpoint"] !== OPENID) return null;
  if (!(query["openid.return_to"] ?? "").startsWith(callbackUrl)) return null;
  const id = CLAIMED.exec(query["openid.claimed_id"] ?? "")?.[1];
  if (!id || query["openid.identity"] !== query["openid.claimed_id"]) return null;
  const body = new URLSearchParams(Object.entries(query).filter(([k]) => k.startsWith("openid.")));
  body.set("openid.mode", "check_authentication");
  const res = await fetcher(OPENID, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return /(^|\n)is_valid:true(\n|$)/.test(await res.text()) ? id : null;
}

/** The public Steam profile name and avatar (needs STEAM_API_KEY; without it, a generic name). */
async function steamProfile(steamId: string): Promise<{ name: string; image: string | null }> {
  const key = process.env.STEAM_API_KEY;
  if (key) {
    try {
      const res = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`, { signal: AbortSignal.timeout(5000) });
      const p = (await res.json())?.response?.players?.[0];
      if (p?.personaname) return { name: String(p.personaname).slice(0, 40), image: p.avatarfull ?? null };
    } catch { /* fall back to the generic name */ }
  }
  return { name: `Steam ${steamId.slice(-5)}`, image: null };
}

export function steam() {
  return {
    id: "steam",
    endpoints: {
      steamStart: createAuthEndpoint("/steam/start", {
        method: "GET",
        query: z.object({ mode: z.enum(["login", "link"]).optional(), next: z.string().max(300).optional() }),
      }, async (ctx) => {
        const mode = ctx.query.mode ?? "login";
        const next = safeNextPath(ctx.query.next, ["/auth"]);
        let userId: string | undefined;
        if (mode === "link") {
          const session = await getSessionFromCtx(ctx);
          if (!session) throw ctx.redirect(`/auth/sign-in?next=${encodeURIComponent("/account")}`);
          userId = session.user.id;
        }
        const state: State = { nonce: randomBytes(16).toString("hex"), mode, next, userId };
        await ctx.setSignedCookie(STATE_COOKIE, JSON.stringify(state), ctx.context.secret, {
          httpOnly: true, sameSite: "lax", secure: ctx.context.baseURL.startsWith("https://"), path: "/", maxAge: 600,
        });
        const callback = `${ctx.context.baseURL}/steam/callback?state=${state.nonce}`;
        throw ctx.redirect(steamLoginUrl(callback, new URL(ctx.context.baseURL).origin));
      }),

      steamCallback: createAuthEndpoint("/steam/callback", {
        method: "GET",
        query: z.record(z.string(), z.string()),
      }, async (ctx) => {
        const raw = await ctx.getSignedCookie(STATE_COOKIE, ctx.context.secret);
        ctx.setCookie(STATE_COOKIE, "", { path: "/", maxAge: 0 });
        let state: State | null = null;
        try { state = raw ? (JSON.parse(raw) as State) : null; } catch { state = null; }
        const fail = (why: string) => { throw ctx.redirect(`${state?.mode === "link" ? "/account" : "/auth/sign-in"}?steam=${why}`); };
        if (!state || ctx.query.state !== state.nonce) return fail("expired");

        const callback = `${ctx.context.baseURL}/steam/callback?state=${state.nonce}`;
        const steamId = await verifySteam(ctx.query, callback).catch(() => null);
        if (!steamId) return fail("failed");
        const adapter = ctx.context.internalAdapter;
        const linked = await adapter.findAccountByProviderId(steamId, STEAM_PROVIDER);

        if (state.mode === "link") {
          const session = await getSessionFromCtx(ctx);
          if (!session || session.user.id !== state.userId) return fail("expired");
          if (linked && linked.userId !== session.user.id) return fail("taken");
          if (!linked) {
            const mine = (await adapter.findAccounts(session.user.id)).find((a) => a.providerId === STEAM_PROVIDER);
            if (mine) return fail("already");
            await adapter.linkAccount({ userId: session.user.id, providerId: STEAM_PROVIDER, accountId: steamId });
          }
          throw ctx.redirect("/account?steam=linked");
        }

        let user = linked ? await adapter.findUserById(linked.userId) : null;
        if (!user) {
          const profile = await steamProfile(steamId);
          user = await adapter.createUser({ name: profile.name, email: `${steamId}@${PLACEHOLDER_DOMAIN}`, emailVerified: false, image: profile.image });
          await adapter.linkAccount({ userId: user.id, providerId: STEAM_PROVIDER, accountId: steamId });
        }
        await ensureProfile({ id: user.id, name: user.name, email: user.email, image: user.image });
        const session = await adapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        throw ctx.redirect(state.next);
      }),

      steamUnlink: createAuthEndpoint("/steam/unlink", { method: "POST" }, async (ctx) => {
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError("UNAUTHORIZED");
        const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);
        const steamAccount = accounts.find((a) => a.providerId === STEAM_PROVIDER);
        if (!steamAccount) return ctx.json({ ok: true });
        // Keep a way back in: a password, or a real email address for sign-in codes.
        const canSignIn = accounts.some((a) => a.providerId === "credential") || !isPlaceholderEmail(session.user.email);
        if (!canSignIn) throw new APIError("BAD_REQUEST", { message: "Set a password first: Steam is your only way to sign in." });
        await ctx.context.internalAdapter.deleteAccount(steamAccount.id);
        return ctx.json({ ok: true });
      }),
    },
  } satisfies BetterAuthPlugin;
}
