import { createHmac } from "node:crypto";
import { LOCKS } from "../src/locks.config";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "http://localhost:3010";

// Sign an admin cookie if SESSION_SECRET is set in env
function getAdminCookie(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const exp = String(Date.now() + 60 * 60 * 24 * 7 * 1000);
  // Same as src/lib/admin/auth.ts: the signature covers the expiry and the current admin password.
  const sig = createHmac("sha256", secret).update(`${exp}|${process.env.ADMIN_PASSWORD ?? ""}`).digest("base64url");
  return `gl_admin=${exp}.${sig}`;
}

type CheckResult = {
  url: string;
  status: number;
  expected: string;
  ok: boolean;
  problem?: string;
};

async function check(urlPath: string, options: { cookie?: string; authBearer?: string; allowRedirect?: boolean } = {}): Promise<CheckResult> {
  const fullUrl = `${BASE_URL}${urlPath}`;
  const headers: Record<string, string> = {};
  if (options.cookie) headers["cookie"] = options.cookie;
  if (options.authBearer) headers["authorization"] = `Bearer ${options.authBearer}`;

  try {
    const res = await fetch(fullUrl, {
      headers,
      redirect: "manual",
    });

    const status = res.status;
    let ok = false;
    let expected = "200";

    if (urlPath === "/lock/seance") {
      expected = "307";
      ok = status === 307;
    } else if (urlPath === "/admin/login" && options.cookie) {
      expected = "307";
      ok = status === 307;
    } else if (status === 200) {
      ok = true;
    } else if (status === 307 && !options.cookie && urlPath.startsWith("/admin")) {
      expected = "307 (redirect to login)";
      ok = true;
    }

    let problem: string | undefined;
    if (!ok) {
      const text = await res.text().catch(() => "");
      problem = `HTTP ${status}: ${text.slice(0, 100).replace(/\s+/g, " ")}`;
    }

    return {
      url: urlPath,
      status,
      expected,
      ok,
      problem,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      url: urlPath,
      status: 0,
      expected: "200",
      ok: false,
      problem: message,
    };
  }
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`Checking route reachability against: ${BASE_URL}`);
  console.log(`======================================================\n`);

  const adminCookie = getAdminCookie();
  const readToken = process.env.AGENT_API_READ_TOKEN;

  const results: CheckResult[] = [];

  // 1. Health
  results.push(await check("/api/health"));

  // 2. Main game pages
  results.push(await check("/"));
  results.push(await check("/how-to-play"));
  results.push(await check("/archive/2026-09-30"));
  results.push(await check("/lock/seance")); // Expects redirect to /lock/seance-mechanics

  // 3. Player lock pages (today and archive)
  for (const lock of LOCKS) {
    results.push(await check(`/lock/${lock.slug}`));
    results.push(await check(`/lock/${lock.slug}?d=2026-09-30`));
  }

  // 4. Admin pages
  const adminRoutes = [
    "/admin",
    "/admin/login",
    "/admin/review",
    "/admin/calendar",
    "/admin/puzzles",
    ...LOCKS.map((l) => `/admin/puzzles/${l.slug}`),
    "/admin/heroes",
    "/admin/abilities",
    "/admin/items",
    "/admin/categories",
    "/admin/texts",
    "/admin/sounds",
    "/admin/seance",
    "/admin/seance/preview",
    "/admin/omens",
  ];

  for (const r of adminRoutes) {
    results.push(await check(r, { cookie: adminCookie ?? undefined }));
  }

  // 5. Agent API endpoints
  if (readToken) {
    results.push(await check("/api/agent/v1", { authBearer: readToken }));
    results.push(await check("/api/agent/v1/state", { authBearer: readToken }));
    results.push(await check("/api/agent/v1/categories", { authBearer: readToken }));
    results.push(await check("/api/agent/v1/seance/categories", { authBearer: readToken }));
    results.push(await check("/api/agent/v1/puzzles/visage", { authBearer: readToken }));
  }

  // Output table
  console.log("| URL | Status | Expected | Result | Problem |");
  console.log("| :--- | :--- | :--- | :--- | :--- |");
  let failed = 0;
  for (const r of results) {
    const symbol = r.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`| ${r.url} | ${r.status} | ${r.expected} | ${symbol} | ${r.problem || "-"} |`);
    if (!r.ok) failed++;
  }

  console.log(`\nTotal routes checked: ${results.length}`);
  console.log(`Passed: ${results.length - failed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
