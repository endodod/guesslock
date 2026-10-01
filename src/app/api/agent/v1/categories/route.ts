// GET /api/agent/v1/categories — list attribute categories
// POST /api/agent/v1/categories — create a new attribute category
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { attributeCategories } from "@/lib/agent/state";
import { createAttributeCategory } from "@/lib/agent/ops";
import { CategoryCreate } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";
import { loadGameData } from "@/lib/engine/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const entity = new URL(req.url).searchParams.get("entity") === "item" ? "item" : "hero";
    const data = await loadGameData();
    const cats = attributeCategories(data);
    return json({ entity, categories: entity === "hero" ? cats.hero : cats.item });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}

export async function POST(req: Request) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, CategoryCreate);
  if ("res" in b) return b.res;
  try {
    const dryRun = isDryRun(req);
    const result = await createAttributeCategory(b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result, 201);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}