// Agent API v1 index: lists all endpoints. Requires read token.
import { guard, json, fail } from "@/lib/agent/guard";
import { LOCKS } from "@/locks.config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req, "read");
  if ("res" in g) return g.res;
  return json({
    version: "v1",
    scopes: { read: "GET endpoints", write: "PATCH/POST endpoints" },
    endpoints: [
      { method: "GET",   path: "/api/agent/v1/state",                               scope: "read",  description: "Global state. ?include=heroes,abilities,items,categories,seance,members (default: locks,categories,seance)" },
      { method: "GET",   path: "/api/agent/v1/puzzles/{slug}",                       scope: "read",  description: "Puzzle state. ?date=YYYY-MM-DD (default: today)" },
      { method: "POST",  path: "/api/agent/v1/puzzles/{slug}",                       scope: "write", description: "Regenerate or override a future puzzle" },
      { method: "GET",   path: "/api/agent/v1/entities/{heroes|abilities|items}/{id}", scope: "read",  description: "Entity state" },
      { method: "PATCH", path: "/api/agent/v1/entities/{heroes|abilities|items}/{id}", scope: "write", description: "Patch aliases, excludeFromModes, values (heroes/items), setup (heroes)" },
      { method: "GET",   path: "/api/agent/v1/categories",                           scope: "read",  description: "Attribute categories. ?entity=hero|item (default: hero)" },
      { method: "POST",  path: "/api/agent/v1/categories",                           scope: "write", description: "Create attribute category" },
      { method: "PATCH", path: "/api/agent/v1/categories/{entity}/{key}",             scope: "write", description: "Update attribute category" },
      { method: "GET",   path: "/api/agent/v1/seance/categories",                    scope: "read",  description: "Séance category library. ?withMembers=1" },
      { method: "POST",  path: "/api/agent/v1/seance/categories",                    scope: "write", description: "Create Séance category draft" },
      { method: "GET",   path: "/api/agent/v1/seance/categories/{id}",               scope: "read",  description: "Single Séance category" },
      { method: "PATCH", path: "/api/agent/v1/seance/categories/{id}",               scope: "write", description: "Update label, explanation, difficulty, status, members" },
    ],
    locks: LOCKS.map((l) => ({ slug: l.slug, numeral: l.numeral, name: l.name, mode: l.mode, group: l.group, table: l.table?.kind ?? null })),
    rules: [
      "Puzzle writes are future-only (never today or past).",
      "Séance/Omens do not support override (no single answer id).",
      "Agents can only create category drafts; approval requires AGENT_API_ALLOW_APPROVE=1.",
      "No deletes through the API.",
      "Add ?dryRun=1 to any write endpoint to validate without committing.",
    ],
  });
}
