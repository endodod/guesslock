// GET + PATCH /api/agent/v1/entities/[kind]/[id]
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { entityState } from "@/lib/agent/state";
import { patchEntity } from "@/lib/agent/ops";
import { EntityPatch } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";

export const dynamic = "force-dynamic";

const KINDS = new Set(["heroes", "abilities", "items"]);

export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const { kind, id } = await params;
    if (!KINDS.has(kind)) return fail(404, `Unknown kind "${kind}" (heroes, abilities, items)`);
    return json(await entityState(kind, Number(id)));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, EntityPatch);
  if ("res" in b) return b.res;
  try {
    const { kind, id } = await params;
    if (!KINDS.has(kind)) return fail(404, `Unknown kind "${kind}" (heroes, abilities, items)`);
    const dryRun = isDryRun(req);
    const result = await patchEntity(kind as "heroes" | "abilities" | "items", Number(id), b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}