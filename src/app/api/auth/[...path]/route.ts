import { auth, authConfigured } from "@/lib/auth/server";

type Ctx = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// Resolved per request, so a deployment without the Neon Auth settings still builds (see lib/auth/server.ts).
const handle = (method: Method) => (req: Request, ctx: Ctx): Promise<Response> =>
  authConfigured()
    ? (auth.handler()[method] as (req: Request, ctx: Ctx) => Promise<Response>)(req, ctx)
    : Promise.resolve(Response.json({ error: "Accounts are not configured on this deployment." }, { status: 503 }));

export const GET = handle("GET");
export const POST = handle("POST");
export const PUT = handle("PUT");
export const DELETE = handle("DELETE");
export const PATCH = handle("PATCH");
