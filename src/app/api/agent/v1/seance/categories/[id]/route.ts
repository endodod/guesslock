// GET + PATCH /api/agent/v1/seance/categories/[id]
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { patchSeanceCategory } from "@/lib/agent/ops";
import { SeancePatch } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";
import { db } from "@/lib/db";
import { activeEntities } from "@/lib/seance/library";
import type { SeanceEntity } from "@/locks.config";
import { completeness } from "@/lib/seance/rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return fail(400, "Category id must be a positive integer");

    const row = await db.seanceCategory.findUnique({
      where: { id: numId },
      include: { memberships: { select: { entityId: true, member: true, source: true } } },
    });
    if (!row) return fail(404, `Séance category ${id} not found`);
    const tiles = await activeEntities(row.entity as SeanceEntity);
    const memberships = row.memberships.map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source }));

    const comp = completeness(memberships, tiles.map((h) => h.id));
    return json({
      id: row.id,
      key: row.key,
      entity: row.entity,
      type: row.type,
      label: row.label,
      explanation: row.explanation,
      difficulty: row.difficulty,
      status: row.status,
      source: row.source,
      flagged: row.flagged,
      flagReason: row.flagReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completeness: comp,
      memberships,
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, SeancePatch);
  if ("res" in b) return b.res;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return fail(400, "Category id must be a positive integer");

    const dryRun = isDryRun(req);
    const result = await patchSeanceCategory(numId, b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}
