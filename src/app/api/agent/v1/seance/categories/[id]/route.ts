// GET + PATCH /api/agent/v1/seance/categories/[id]
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { patchSeanceCategory } from "@/lib/agent/ops";
import { SeancePatch } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";
import { db } from "@/lib/db";
import { activeHeroes } from "@/lib/seance/library";
import { completeness } from "@/lib/seance/rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return fail(400, "Category id must be a positive integer");

    const [row, heroes] = await Promise.all([
      db.seanceCategory.findUnique({
        where: { id: numId },
        include: { memberships: { select: { heroId: true, member: true, source: true } } },
      }),
      activeHeroes(),
    ]);

    if (!row) return fail(404, `Séance category ${id} not found`);

    const comp = completeness(row.memberships, heroes.map((h) => h.id));
    return json({
      id: row.id,
      key: row.key,
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
      memberships: row.memberships,
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
