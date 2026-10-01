// PATCH /api/agent/v1/categories/[entity]/[key]
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { patchAttributeCategory } from "@/lib/agent/ops";
import { CategoryPatch } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";
import type { Entity } from "@/lib/admin/categories";

export const dynamic = "force-dynamic";

const ENTITIES = new Set(["hero", "item"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ entity: string; key: string }> }) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, CategoryPatch);
  if ("res" in b) return b.res;
  try {
    const { entity, key } = await params;
    if (!ENTITIES.has(entity)) return fail(404, `Unknown entity "${entity}" (hero, item)`);
    const dryRun = isDryRun(req);
    const result = await patchAttributeCategory(entity as Entity, key, b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}