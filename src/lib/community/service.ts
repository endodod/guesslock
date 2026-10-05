// Community puzzles: player-made sorting tables and Constellations. Published right away after the automatic checks,
// played statelessly like Endless (the client keeps its entries), never worth souls.
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { config } from "../config";
import { makeRng } from "../rng";
import { LOCK_BY_SLUG, type LockDef } from "@/locks.config";
import { loadGameData } from "../engine/context";
import { evaluate } from "../engine/play";
import { checkGrid, constellationFacets, constellationPayload, type Facet } from "../engine/modes/constellation";
import { heroCategories } from "../engine/generate";
import { activeEntities } from "../seance/library";
import { evaluateSeance } from "../seance/play";
import type { Rank, SeancePayload, SeanceView } from "../seance/types";
import type { PlayView } from "../engine/types";
import type { Prisma } from "@/generated/prisma/client";
import {
  DAILY_CREATE_LIMIT, EXPLANATION_MAX, LABEL_MAX, REPORTS_TO_HIDE, TITLE_MAX, facetId, textProblem,
  type CommunityInputT, type CommunityKind, type CommunitySummary, type FacetOption,
} from "./rules";

export class CommunityError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** The locks a community puzzle is evaluated as (only the table kind and the Constellation's rules matter). */
const SEANCE_LOCK: LockDef = { ...LOCK_BY_SLUG["seance-mixed"], slug: "community" };
const GRID_LOCK: LockDef = { ...LOCK_BY_SLUG["constellation"], slug: "community" };

// Game data and categories are shared between requests for a while (built per server instance).
let cached: { at: number; value: Promise<{ pool: Awaited<ReturnType<typeof loadGameData>>["heroes"]; facets: Facet[] }> } | null = null;
function gridData() {
  if (!cached || Date.now() - cached.at > 10 * 60_000) {
    cached = { at: Date.now(), value: Promise.all([loadGameData(), heroCategories()]).then(([data, groups]) => constellationFacets(data, groups)) };
  }
  return cached.value;
}

/** Every Constellation category with its heroes, for the editor. */
export async function facetOptions(): Promise<{ facets: FacetOption[]; heroes: { id: number; name: string; image: string | null }[] }> {
  const { pool, facets } = await gridData();
  return {
    facets: facets.map((f) => ({ id: facetId(f), dim: f.dim, label: f.label, info: f.info, members: [...f.members] })).sort((a, b) => a.label.localeCompare(b.label)),
    heroes: pool.map((h) => ({ id: h.id, name: h.name, image: h.icon })),
  };
}

/** Builds and checks the frozen payload of a new puzzle; throws CommunityError with a message for the author. */
export async function buildCommunityPayload(input: CommunityInputT, authorId: string): Promise<{ payload: object; entity: string | null }> {
  const titleErr = textProblem(input.title, "The title", TITLE_MAX);
  if (titleErr) throw new CommunityError(titleErr);

  if (input.kind === "constellation") {
    const { pool, facets } = await gridData();
    const byId = new Map(facets.map((f) => [facetId(f), f]));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id));
    const rows = pick(input.rows), cols = pick(input.cols);
    if ([...rows, ...cols].some((f) => !f)) throw new CommunityError("One of the categories no longer exists. Pick it again.");
    const grid = checkGrid(rows as Facet[], cols as Facet[]);
    if ("error" in grid) throw new CommunityError(grid.error);
    return { payload: constellationPayload({ rows: rows as Facet[], cols: cols as Facet[], ...grid }, pool, `community:${authorId}`), entity: null };
  }

  const entities = new Map((await activeEntities(input.entity)).map((e) => [e.id, e]));
  const all = input.groups.flatMap((g) => g.members);
  if (new Set(all).size !== 16) throw new CommunityError("Every tile can be in one group only: pick 16 different ones.");
  const missing = all.find((id) => !entities.has(id));
  if (missing) throw new CommunityError("One of the tiles no longer exists. Pick it again.");
  const labels = new Set<string>();
  input.groups.forEach((g, i) => {
    const err = textProblem(g.label, `Group ${i + 1}'s name`, LABEL_MAX) ?? textProblem(g.explanation ?? "", `Group ${i + 1}'s explanation`, EXPLANATION_MAX, false);
    if (err) throw new CommunityError(err);
    if (labels.has(g.label.trim().toLowerCase())) throw new CommunityError("Two groups have the same name.");
    labels.add(g.label.trim().toLowerCase());
  });
  const payload: SeancePayload = {
    v: 1, mode: "seance", entity: input.entity, table: "mixed", source: "community", authorUserId: authorId,
    heroes: makeRng(`community:${all.join(",")}`).shuffle(all).map((id) => entities.get(id)!),
    groups: input.groups.map((g, i) => ({
      categoryId: i + 1, label: g.label.trim(), explanation: g.explanation?.trim() || null, difficulty: i + 1, rank: (i + 1) as Rank, members: g.members,
    })),
    redHerrings: 0,
  };
  return { payload, entity: input.entity };
}

const row = (payload: unknown) => ({ date: "community", mode: "community", sealed: false, sealedReason: null, payload });

export async function createCommunityPuzzle(authorId: string, input: CommunityInputT): Promise<{ id: string }> {
  const since = new Date(Date.now() - 24 * 3600_000);
  if ((await db.communityPuzzle.count({ where: { authorId, createdAt: { gte: since } } })) >= DAILY_CREATE_LIMIT) {
    throw new CommunityError(`You can publish ${DAILY_CREATE_LIMIT} puzzles a day. Come back tomorrow.`, 429);
  }
  const { payload, entity } = await buildCommunityPayload(input, authorId);
  const id = randomBytes(8).readBigUInt64BE().toString(36).padStart(10, "0").slice(0, 10);
  await db.communityPuzzle.create({ data: { id, authorId, kind: input.kind, entity, title: input.title.trim(), payload: payload as Prisma.InputJsonValue } });
  return { id };
}

/** A sorting table shows four of its tiles; a Constellation nothing (its heroes would be a solution). */
function coverImages(kind: string, payload: unknown): string[] {
  if (kind === "seance") return (payload as SeancePayload).heroes.flatMap((h) => (h.image ? [h.image] : [])).slice(0, 4);
  return [];
}

async function authors(ids: string[]): Promise<Map<string, string>> {
  const rows = await db.profile.findMany({ where: { userId: { in: [...new Set(ids)] } }, select: { userId: true, displayName: true } });
  return new Map(rows.map((r) => [r.userId, r.displayName]));
}

export async function listCommunityPuzzles(opts: { kind?: CommunityKind; sort?: "new" | "popular"; author?: string; take?: number } = {}): Promise<CommunitySummary[]> {
  const rows = await db.communityPuzzle.findMany({
    where: { status: "live", ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.author ? { authorId: opts.author } : {}) },
    orderBy: opts.sort === "popular" ? [{ plays: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    take: Math.min(opts.take ?? 60, 100),
  });
  const names = await authors(rows.map((r) => r.authorId));
  return rows.map((r) => ({
    id: r.id, kind: r.kind as CommunityKind, entity: r.entity, title: r.title, author: names.get(r.authorId) ?? "A player",
    plays: r.plays, solves: r.solves, createdAt: r.createdAt.toISOString(), images: coverImages(r.kind, r.payload),
  }));
}

export async function getCommunityPuzzle(id: string, opts: { includeHidden?: boolean } = {}) {
  const r = await db.communityPuzzle.findUnique({ where: { id } });
  if (!r || (r.status !== "live" && !opts.includeHidden)) return null;
  const names = await authors([r.authorId]);
  return { ...r, author: names.get(r.authorId) ?? "A player" };
}

export type CommunityView = { kind: "seance"; view: SeanceView } | { kind: "constellation"; view: PlayView };

/** Replays a puzzle's entries (Séance submissions, or Constellation moves). */
export function evaluateCommunity(kind: string, payload: unknown, entries: string[]): CommunityView {
  if (kind === "seance") return { kind: "seance", view: evaluateSeance(SEANCE_LOCK, row(payload), 0, entries).view };
  return { kind: "constellation", view: evaluate(GRID_LOCK, row(payload), 0, entries, undefined, () => undefined) };
}

/** A guest is counted by a salted hash of their address (never stored in the clear). */
export const guestKey = (ip: string) => `ip:${createHash("sha256").update(`${config.salt}:${ip}`).digest("hex").slice(0, 16)}`;

export async function playCommunity(id: string, entries: string[], player: string): Promise<CommunityView | null> {
  const p = await getCommunityPuzzle(id);
  if (!p) return null;
  const v = evaluateCommunity(p.kind, p.payload, entries);
  // Counted once per player: a play on the first move, a solve on the first win.
  if (entries.length) {
    const won = v.view.status === "won";
    const prev = await db.communityPlay.findUnique({ where: { puzzleId_player: { puzzleId: id, player } } });
    if (!prev) {
      const made = await db.communityPlay.createMany({ data: [{ puzzleId: id, player, solved: won }], skipDuplicates: true });
      if (made.count) await db.communityPuzzle.update({ where: { id }, data: { plays: { increment: 1 }, ...(won ? { solves: { increment: 1 } } : {}) } });
    } else if (won && !prev.solved) {
      const upd = await db.communityPlay.updateMany({ where: { puzzleId: id, player, solved: false }, data: { solved: true } });
      if (upd.count) await db.communityPuzzle.update({ where: { id }, data: { solves: { increment: 1 } } });
    }
  }
  return v;
}

export async function reportCommunity(id: string, userId: string, reason?: string): Promise<{ hidden: boolean }> {
  if (!(await db.communityPuzzle.findUnique({ where: { id }, select: { id: true } }))) throw new CommunityError("That puzzle is gone.", 404);
  const made = await db.communityReport.createMany({ data: [{ puzzleId: id, userId, reason: reason?.slice(0, 300) || null }], skipDuplicates: true });
  if (!made.count) return { hidden: false };
  const p = await db.communityPuzzle.update({ where: { id }, data: { reports: { increment: 1 } } });
  if (p.reports >= REPORTS_TO_HIDE && p.status === "live") {
    await db.communityPuzzle.update({ where: { id }, data: { status: "hidden" } });
    return { hidden: true };
  }
  return { hidden: false };
}

/** Admin: hide or restore a puzzle (restoring clears its reports). */
export async function setCommunityStatus(id: string, status: "live" | "hidden") {
  await db.$transaction([
    db.communityPuzzle.update({ where: { id }, data: { status, ...(status === "live" ? { reports: 0 } : {}) } }),
    ...(status === "live" ? [db.communityReport.deleteMany({ where: { puzzleId: id } })] : []),
  ]);
}

/** Authors may delete their own puzzles. */
export async function deleteOwnCommunity(id: string, userId: string): Promise<boolean> {
  const r = await db.communityPuzzle.deleteMany({ where: { id, authorId: userId } });
  if (r.count) await db.$transaction([db.communityPlay.deleteMany({ where: { puzzleId: id } }), db.communityReport.deleteMany({ where: { puzzleId: id } })]);
  return r.count > 0;
}
