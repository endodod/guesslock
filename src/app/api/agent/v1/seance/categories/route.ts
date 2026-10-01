// GET /api/agent/v1/seance/categories — list seance categories
// POST /api/agent/v1/seance/categories — create a new seance category (draft)
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { seanceCategories } from "@/lib/agent/state";
import { createSeanceCategory } from "@/lib/agent/ops";
import { SeanceCreate } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const url = new URL(req.url);
    const withMembers = url.searchParams.get("members") === "1" ||
      url.searchParams.get("members") === "true" ||
      url.searchParams.get("withMembers") === "1" ||
      url.searchParams.get("withMembers") === "true";
    const categories = await seanceCategories(withMembers);
    return json({ categories });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}

export async function POST(req: Request) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, SeanceCreate);
  if ("res" in b) return b.res;
  try {
    const dryRun = isDryRun(req);
    const result = await createSeanceCategory(b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result, 201);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}
