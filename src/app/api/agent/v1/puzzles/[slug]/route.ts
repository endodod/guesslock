// GET + POST /api/agent/v1/puzzles/[slug]
import { guard, json, fail, readBody, isDryRun, audit } from "@/lib/agent/guard";
import { puzzleState } from "@/lib/agent/state";
import { puzzleAction } from "@/lib/agent/ops";
import { PuzzleAction } from "@/lib/agent/schemas";
import { HttpError } from "@/lib/agent/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const { slug } = await params;
    const date = new URL(req.url).searchParams.get("date") ?? null;
    return json(await puzzleState(slug, date));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(req, "write");
  if ("res" in g) return g.res;
  const b = await readBody(req, PuzzleAction);
  if ("res" in b) return b.res;
  try {
    const { slug } = await params;
    const dryRun = isDryRun(req);
    const result = await puzzleAction(slug, b.data, dryRun);
    if (!dryRun) await audit(g.who, req, result);
    return json(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    return json({ error: String(e) }, 500);
  }
}