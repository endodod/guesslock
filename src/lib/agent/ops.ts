// Agent API write operations. Each function:
//  - takes dryRun: boolean (no DB writes, but full validation)
//  - throws HttpError on bad input
//  - returns a before/after summary object
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { loadGameData } from "../engine/context";
import { generateDay, overridePuzzle } from "../engine/generate";
import { syncTexts } from "../sync/assets";
import { saveCategoryValues, type Entity } from "../admin/categories";
import { completeness } from "../seance/rules";
import { activeEntities, loadCategoryRows } from "../seance/library";
import { ENTITY_TYPES } from "../seance/types";
import { HERO_COLUMNS, ITEM_COLUMNS } from "../engine/columns";
import { todayDate, isDay } from "../day";
import { LOCK_BY_SLUG, LOCKS, type SeanceEntity } from "@/locks.config";
import { MODES } from "../engine/registry";
import { config } from "../config";
import { HttpError } from "./errors";
import type { EntityPatch, CategoryCreate, CategoryPatch, MemberEdit, SeanceCreate, SeancePatch, PuzzleAction } from "./schemas";
import { puzzlesChanged } from "@/lib/server/cache";

// ---- helpers ----------------------------------------------------------------

/** Merge a listEdit (full replace or {add, remove}) into an existing array; deduplication is case-insensitive. */
function applyListEdit(existing: string[], edit: string[] | { add?: string[]; remove?: string[] }): string[] {
  if (Array.isArray(edit)) {
    const seen = new Set<string>();
    return edit.filter((v) => { const k = v.toLowerCase(); const ok = !seen.has(k); seen.add(k); return ok; });
  }
  const add = edit.add ?? [];
  const remove = new Set((edit.remove ?? []).map((v) => v.toLowerCase()));
  const base = existing.filter((v) => !remove.has(v.toLowerCase()));
  const seen = new Set(base.map((v) => v.toLowerCase()));
  for (const a of add) { const k = a.toLowerCase(); if (!seen.has(k)) { seen.add(k); base.push(a); } }
  return base;
}

function allModeSlugs(): Set<string> {
  return new Set([...LOCKS.map((l) => l.mode), ...LOCKS.map((l) => l.slug)]);
}

// ---- entities ---------------------------------------------------------------

export async function patchEntity(
  kind: "heroes" | "abilities" | "items",
  rawId: number,
  patch: EntityPatch,
  dryRun: boolean,
) {
  const data = await loadGameData();
  const known = allModeSlugs();

  if (kind === "heroes") {
    const h = data.hero(rawId);
    if (!h) throw new HttpError(404, `Unknown hero id ${rawId}`);
    const before = { aliases: [...h.aliases], excludeFromModes: [...h.exclude], setup: { ...h.setup } };

    const aliases = patch.aliases !== undefined
      ? applyListEdit(h.aliases, patch.aliases as string[] | { add?: string[]; remove?: string[] })
      : h.aliases;

    let excl = h.exclude;
    if (patch.excludeFromModes !== undefined) {
      const raw = applyListEdit(h.exclude, patch.excludeFromModes as string[] | { add?: string[]; remove?: string[] });
      const bad = raw.filter((m) => !known.has(m));
      if (bad.length) throw new HttpError(422, `Unknown modes: ${bad.join(", ")}. Known: ${[...known].sort().join(", ")}`);
      excl = raw;
    }

    const newSetup = patch.setup
      ? {
          ...h.setup,
          ...(patch.setup.buildPin !== undefined ? { buildPin: patch.setup.buildPin } : {}),
          ...(patch.setup.buildBan !== undefined ? { buildBan: patch.setup.buildBan } : {}),
        }
      : h.setup;

    if (!dryRun) {
      await db.hero.update({
        where: { id: rawId },
        data: { aliases, excludeFromModes: excl, setup: newSetup as unknown as Prisma.InputJsonValue },
      });
      if (patch.values) {
        const edits = Object.entries(patch.values).map(([key, val]) => ({
          id: rawId, key, raw: val === null ? "" : String(val),
        }));
        await saveCategoryValues("hero", edits, data);
      }
      revalidateTag("catalog", { expire: 0 });
      if (patch.aliases !== undefined) {
        after(async () => { try { await syncTexts(); } catch { /* best effort */ } });
      }
    }
    return { entity: "hero", id: rawId, name: h.name, dryRun, before, after: { aliases, excludeFromModes: excl, setup: newSetup } };
  }

  if (kind === "abilities") {
    const a = data.ability(rawId);
    if (!a) throw new HttpError(404, `Unknown ability id ${rawId}`);
    if (patch.values) throw new HttpError(422, "Abilities do not support category values");
    if (patch.setup) throw new HttpError(422, "Abilities do not support setup");
    const before = { aliases: [...a.aliases], excludeFromModes: [...a.exclude] };
    const aliases = patch.aliases !== undefined
      ? applyListEdit(a.aliases, patch.aliases as string[] | { add?: string[]; remove?: string[] })
      : a.aliases;
    let excl = a.exclude;
    if (patch.excludeFromModes !== undefined) {
      const raw = applyListEdit(a.exclude, patch.excludeFromModes as string[] | { add?: string[]; remove?: string[] });
      const bad = raw.filter((m) => !known.has(m));
      if (bad.length) throw new HttpError(422, `Unknown modes: ${bad.join(", ")}`);
      excl = raw;
    }
    if (!dryRun) {
      await db.ability.update({ where: { id: BigInt(rawId) }, data: { aliases, excludeFromModes: excl } });
      revalidateTag("catalog", { expire: 0 });
      if (patch.aliases !== undefined) {
        after(async () => { try { await syncTexts(); } catch { /* best effort */ } });
      }
    }
    return { entity: "ability", id: rawId, name: a.name, dryRun, before, after: { aliases, excludeFromModes: excl } };
  }

  if (kind === "items") {
    const item = data.item(rawId);
    if (!item) throw new HttpError(404, `Unknown item id ${rawId}`);
    if (patch.setup) throw new HttpError(422, "Items do not support setup");
    const before = { aliases: [...item.aliases], excludeFromModes: [...item.exclude] };
    const aliases = patch.aliases !== undefined
      ? applyListEdit(item.aliases, patch.aliases as string[] | { add?: string[]; remove?: string[] })
      : item.aliases;
    let excl = item.exclude;
    if (patch.excludeFromModes !== undefined) {
      const raw = applyListEdit(item.exclude, patch.excludeFromModes as string[] | { add?: string[]; remove?: string[] });
      const bad = raw.filter((m) => !known.has(m));
      if (bad.length) throw new HttpError(422, `Unknown modes: ${bad.join(", ")}`);
      excl = raw;
    }
    if (!dryRun) {
      await db.item.update({ where: { id: BigInt(rawId) }, data: { aliases, excludeFromModes: excl } });
      if (patch.values) {
        const edits = Object.entries(patch.values).map(([key, val]) => ({
          id: rawId, key, raw: val === null ? "" : String(val),
        }));
        await saveCategoryValues("item", edits, data);
      }
      revalidateTag("catalog", { expire: 0 });
    }
    return { entity: "item", id: rawId, name: item.name, dryRun, before, after: { aliases, excludeFromModes: excl } };
  }

  throw new HttpError(404, "Unknown entity kind (heroes, abilities, items)");
}

// ---- attribute categories ---------------------------------------------------

function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createAttributeCategory(body: CategoryCreate, dryRun: boolean) {
  const { entity, label, type, unit, info } = body;
  const key = slugify(label);
  if (!key) throw new HttpError(422, "Label must contain at least one alphanumeric character");
  const dbKey = `${entity}.${key}`;
  const builtins = entity === "hero" ? HERO_COLUMNS : ITEM_COLUMNS;
  if (builtins.some((c) => c.key === key)) throw new HttpError(409, `"${key}" is a built-in column and cannot be overridden`);
  const existing = await db.category.findUnique({ where: { key: dbKey } });
  if (existing) throw new HttpError(409, `Category "${key}" already exists for ${entity}`);
  const lastOrder = await db.category.aggregate({ where: { entity }, _max: { order: true } });
  const order = Math.max(lastOrder._max.order ?? 0, builtins.length * 10) + 10;
  if (!dryRun) {
    await db.category.create({
      data: { key: dbKey, entity, label, info: info ?? "", type: type ?? "exact", unit: unit ?? "", builtin: false, enabled: true, order },
    });
    revalidateTag("catalog", { expire: 0 });
  }
  return { created: true, dryRun, entity, key: dbKey, label, type: type ?? "exact", unit: unit ?? null, info: info ?? null };
}

export async function patchAttributeCategory(entity: Entity, key: string, body: CategoryPatch, dryRun: boolean) {
  const dbKey = `${entity}.${key}`;
  const row = await db.category.findUnique({ where: { key: dbKey } });
  if (!row) throw new HttpError(404, `Category "${dbKey}" not found`);
  const before = { label: row.label, info: row.info, enabled: row.enabled, order: row.order };
  const updated = {
    label: body.label ?? row.label,
    info: body.info ?? row.info,
    enabled: body.enabled ?? row.enabled,
    order: body.order ?? row.order,
  };
  if (!dryRun) {
    await db.category.update({ where: { key: dbKey }, data: updated });
    revalidateTag("catalog", { expire: 0 });
  }
  return { dryRun, entity, key: dbKey, before, after: updated };
}

// ---- Séance categories ------------------------------------------------------

async function applyMemberOps(
  categoryId: number,
  members: MemberEdit,
  activeIds: Set<number>,
  dryRun: boolean,
) {
  const add = members.add ?? [];
  const notMem = members.notMembers ?? [];
  const remove = members.remove ?? [];
  const all = [...new Set([...add, ...notMem, ...remove])];
  const bad = all.filter((id) => !activeIds.has(id));
  if (bad.length) throw new HttpError(422, `Unknown or inactive ids for this category's entity: ${bad.join(", ")}`);

  if (!dryRun) {
    if (remove.length) await db.seanceMembership.deleteMany({ where: { categoryId, entityId: { in: remove.map(BigInt) } } });
    for (const n of add) {
      const entityId = BigInt(n);
      await db.seanceMembership.upsert({
        where: { categoryId_entityId: { categoryId, entityId } },
        create: { categoryId, entityId, member: true, source: "agent" },
        update: { member: true, source: "agent" },
      });
    }
    for (const n of notMem) {
      const entityId = BigInt(n);
      await db.seanceMembership.upsert({
        where: { categoryId_entityId: { categoryId, entityId } },
        create: { categoryId, entityId, member: false, source: "agent" },
        update: { member: false, source: "agent" },
      });
    }
    if (categoryId >= 0) await db.seanceCategory.update({ where: { id: categoryId }, data: { updatedAt: new Date() } });
  }
  return { added: add, notMembers: notMem, removed: remove };
}

export async function createSeanceCategory(body: SeanceCreate, dryRun: boolean) {
  const entity = body.entity as SeanceEntity;
  if (!(ENTITY_TYPES[entity] as readonly string[]).includes(body.type)) {
    throw new HttpError(422, `Unknown type "${body.type}" for ${entity}. Valid: ${ENTITY_TYPES[entity].join(", ")}`);
  }
  const tiles = await activeEntities(entity);
  const activeIds = new Set(tiles.map((h) => h.id));
  let categoryId = -1;
  if (!dryRun) {
    const c = await db.seanceCategory.create({
      data: { entity, type: body.type, label: body.label, explanation: body.explanation ?? null, source: "curated", difficulty: body.difficulty ?? 2, status: "draft" },
    });
    categoryId = c.id;
  }
  const memberOps = await applyMemberOps(categoryId, body.members, activeIds, dryRun);
  const rows = dryRun ? [] : await db.seanceMembership.findMany({ where: { categoryId } });
  const comp = completeness(rows.map((r) => ({ entityId: Number(r.entityId), member: r.member, source: r.source })), [...activeIds]);
  return { created: true, dryRun, id: categoryId, entity, type: body.type, label: body.label, status: "draft", memberOps, completeness: comp };
}

export async function patchSeanceCategory(id: number, body: SeancePatch, dryRun: boolean) {
  const row = await db.seanceCategory.findUnique({ where: { id }, include: { memberships: true } });
  if (!row) throw new HttpError(404, `Séance category ${id} not found`);
  const tiles = await activeEntities(row.entity as SeanceEntity);
  const activeIds = new Set(tiles.map((h) => h.id));
  const rowMemberships = row.memberships.map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source }));
  const before = { label: row.label, explanation: row.explanation, difficulty: row.difficulty, status: row.status };

  if (body.status === "approved") {
    if (!config.agentMayApprove) throw new HttpError(403, "Agents may not approve categories (AGENT_API_ALLOW_APPROVE is off)");
    const comp = completeness(rowMemberships, [...activeIds]);
    if (!comp.complete) throw new HttpError(422, `Category is not complete (${comp.unknown.length} unknown); complete it before approving`);
  }

  let memberOps = null;
  let membersBody = body.members;
  if (membersBody?.completeRest) {
    const have = new Set(rowMemberships.map((m) => m.entityId));
    const unknown = [...activeIds].filter((hid) => !have.has(hid));
    membersBody = { ...membersBody, notMembers: [...(membersBody.notMembers ?? []), ...unknown] };
  }
  if (membersBody) {
    memberOps = await applyMemberOps(id, membersBody, activeIds, dryRun);
  }

  const updated = {
    label: body.label ?? row.label,
    explanation: body.explanation !== undefined ? (body.explanation ?? null) : row.explanation,
    difficulty: body.difficulty ?? row.difficulty,
    status: body.status ?? row.status,
  };

  if (!dryRun) {
    await db.seanceCategory.update({
      where: { id },
      data: { ...updated, ...(body.status && body.status !== "draft" ? { flagged: false, flagReason: null } : {}) },
    });
  }

  const updatedRows = dryRun
    ? rowMemberships
    : (await db.seanceMembership.findMany({ where: { categoryId: id } })).map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source }));
  const comp = completeness(updatedRows, [...activeIds]);

  return { dryRun, id, before, after: updated, memberOps, completeness: comp };
}

// ---- puzzles ----------------------------------------------------------------

export async function puzzleAction(slug: string, body: PuzzleAction, dryRun: boolean) {
  const lock = LOCK_BY_SLUG[slug];
  if (!lock) throw new HttpError(404, `Unknown lock "${slug}". Slugs: ${LOCKS.map((l) => l.slug).join(", ")}`);
  const { date, action, answerId } = body;
  if (!isDay(date)) throw new HttpError(422, "date must be YYYY-MM-DD");
  const today = todayDate();
  if (date <= today) throw new HttpError(422, `Agents may only act on future dates (after today ${today})`);
  if ((!!lock.box || lock.group === "omens" || MODES[lock.mode]?.selfPicked) && action === "override") {
    throw new HttpError(422, "Override is not available for this lock (no answer list: Séance tables, Omens, The Cache, The Constellation, The Wayfinder); use regenerate");
  }
  const existing = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });

  if (action === "regenerate") {
    if (!dryRun) {
      if (existing && !existing.overridden) await db.dailyPuzzle.delete({ where: { id: existing.id } });
      puzzlesChanged();
      const [r] = await generateDay(date, { slugs: [slug], force: true });
      if (r?.status !== "created") throw new HttpError(500, r?.note ?? r?.status ?? "generation did not produce a row");
    }
    return { dryRun, slug, date, action: "regenerate", was: existing ? { sealed: existing.sealed, answerId: existing.answerId } : null };
  }

  if (action === "override") {
    if (!answerId) throw new HttpError(422, "override requires answerId");
    if (!dryRun) await overridePuzzle(date, slug, answerId);
    return { dryRun, slug, date, action: "override", answerId, was: existing ? { sealed: existing.sealed, answerId: existing.answerId } : null };
  }

  throw new HttpError(422, `Unknown action "${action}"; valid: regenerate, override`);
}

// Re-export loadCategoryRows so route files don't need to reach past the ops boundary.
export { loadCategoryRows };
