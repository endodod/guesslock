// GET /api/agent/v1/state — global state snapshot
import { guard, json } from "@/lib/agent/guard";
import { globalState } from "@/lib/agent/state";

export const dynamic = "force-dynamic";

const VALID = new Set(["heroes", "abilities", "items", "categories", "seance", "members", "locks"]);
const DEFAULT = new Set(["locks", "categories", "seance"]);

export async function GET(req: Request) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  try {
    const q = new URL(req.url).searchParams.get("include");
    const include = q ? new Set(q.split(",").map((s) => s.trim()).filter((s) => VALID.has(s))) : DEFAULT;
    return json(await globalState(include));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
