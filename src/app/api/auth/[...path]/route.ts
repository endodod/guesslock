import { getAuth, authConfigured } from "@/lib/auth/server";
import { clientIp, tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// Resolved per request, so a deployment without the auth settings still builds (see lib/auth/server.ts).
const handle = (method: Method) => async (req: Request): Promise<Response> => {
  if (!authConfigured()) return Response.json({ error: "Accounts are not configured on this deployment." }, { status: 503 });
  // Sign-in, sign-up, password reset and code requests are POSTs: throttle them per address (Better Auth has its own limits too).
  if (method !== "GET") {
    const limit = await rateLimitShared(`auth:${clientIp(req)}`, 30, 60_000);
    if (!limit.ok) return tooMany(limit.retryAfter);
  }
  return getAuth().handler(req);
};

export const GET = handle("GET");
export const POST = handle("POST");
export const PUT = handle("PUT");
export const DELETE = handle("DELETE");
export const PATCH = handle("PATCH");
