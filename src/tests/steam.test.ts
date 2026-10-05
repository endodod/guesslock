import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { isPlaceholderEmail, steamLoginUrl, verifySteam } from "@/lib/auth/steam";

const CALLBACK = "https://guesslock.example/api/auth/steam/callback?state=abc";
const ID = "76561197960287930";
const reply = (over: Record<string, string> = {}) => ({
  state: "abc",
  "openid.ns": "http://specs.openid.net/auth/2.0",
  "openid.mode": "id_res",
  "openid.op_endpoint": "https://steamcommunity.com/openid/login",
  "openid.claimed_id": `https://steamcommunity.com/openid/id/${ID}`,
  "openid.identity": `https://steamcommunity.com/openid/id/${ID}`,
  "openid.return_to": CALLBACK,
  "openid.response_nonce": "2026-10-05T12:00:00Zxyz",
  "openid.assoc_handle": "1234567890",
  "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
  "openid.sig": "abc=",
  ...over,
});
const steamSays = (text: string) => vi.fn(async () => new Response(text)) as unknown as typeof fetch;

describe("Steam OpenID", () => {
  it("sends players to Steam's identifier_select login with our callback", () => {
    const url = new URL(steamLoginUrl(CALLBACK, "https://guesslock.example"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe(CALLBACK);
    expect(url.searchParams.get("openid.realm")).toBe("https://guesslock.example");
  });

  it("accepts a reply Steam confirms and asks Steam with check_authentication", async () => {
    const fetcher = steamSays("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
    expect(await verifySteam(reply(), CALLBACK, fetcher)).toBe(ID);
    const body = (fetcher as unknown as { mock: { calls: [string, { body: URLSearchParams }][] } }).mock.calls[0][1].body;
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.has("state")).toBe(false);
  });

  it("refuses replies Steam doesn't confirm, or that point elsewhere", async () => {
    expect(await verifySteam(reply(), CALLBACK, steamSays("is_valid:false\n"))).toBeNull();
    const ok = steamSays("is_valid:true\n");
    expect(await verifySteam(reply({ "openid.return_to": "https://evil.example/cb" }), CALLBACK, ok)).toBeNull();
    expect(await verifySteam(reply({ "openid.op_endpoint": "https://evil.example/openid" }), CALLBACK, ok)).toBeNull();
    expect(await verifySteam(reply({ "openid.claimed_id": "https://evil.example/id/1", "openid.identity": "https://evil.example/id/1" }), CALLBACK, ok)).toBeNull();
    expect(await verifySteam(reply({ "openid.mode": "cancel" }), CALLBACK, ok)).toBeNull();
  });

  it("knows the placeholder address of Steam-only players", () => {
    expect(isPlaceholderEmail(`${ID}@steam.invalid`)).toBe(true);
    expect(isPlaceholderEmail("someone@example.com")).toBe(false);
  });
});

describe("passwords copied from Neon Auth", () => {
  it("are in Better Auth's own scrypt format, so they verify unchanged", async () => {
    const hash = await hashPassword("correct horse");
    // The format every neon_auth credential row has (checked on the database: 32 hex salt, ":", 128 hex key).
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(true);
    expect(await verifyPassword({ hash, password: "wrong" })).toBe(false);
  });
});
