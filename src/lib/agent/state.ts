// Read side of the agent API: the full state of the site, of one puzzle, and of one hero/ability/item.
import { db } from "../db";
import { todayDate, isDay } from "../day";
import { loadGameData, type GameData } from "../engine/context";
import { MODES } from "../engine/registry";
import { checkLeaks } from "../engine/leaks";
import type { BasePayload } from "../engine/mode";
import { LOCKS, LOCK_BY_SLUG, type LockDef } from "@/locks.config";
import { dayMeta } from "../server/puzzles";
import { poolRows } from "@/app/admin/puzzles/pool";
import { completeness } from "../seance/rules";
import { activeEntities, loadCategoryRows } from "../seance/library";
import type { SeanceEntity } from "@/locks.config";
import { HttpError } from "./errors";

export const ALL_MODES = [...new Set(LOCKS.map((l) => l.mode))];

const lockInfo = (l: LockDef) => ({
  slug: l.slug, numeral: l.numeral, name: l.name, subtitle: l.subtitle, mode: l.mode, group: l.group,
  guess: l.guess, table: l.table?.kind ?? null, hasAnswerPool: !!MODES[l.mode] && l.group !== "omens" && !l.box,
});

/** Values of every category column for a hero or item row (API value, admin override or custom value). */
type Col = { key: string; label: string; info: string; type: string; unit?: string; custom?: boolean; disabled?: boolean; get: (row: never, ctx: GameData) => unknown };
function valuesOf(cols: readonly Col[], row: unknown, data: GameData) {
  const out: Record<string, unknown> = {};
  for (const c of cols) out[c.key] = c.get(row as never, data) ?? null;
  return out;
}

const heroView = (h: GameData["heroes"][number], data: GameData) => ({
  id: h.id, name: h.name, className: h.className, archetype: h.src.heroType, gender: h.gender, species: h.species,
  weaponType: h.weaponType, aliases: h.aliases, excludeFromModes: h.exclude, eligible: h.eligible,
  values: valuesOf(data.heroColumns, h, data), setup: h.setup,
  abilityIds: data.abilitiesOf(h.id).map((a) => a.id),
});
const abilityView = (a: GameData["abilities"][number], data: GameData) => ({
  id: a.id, name: a.name, heroId: a.heroId, hero: data.hero(a.heroId)?.name ?? null, slot: a.slot, aliases: a.aliases, excludeFromModes: a.exclude,
});
const itemView = (i: GameData["items"][number], data: GameData) => ({
  id: i.id, name: i.name, className: i.src.className, slot: i.src.slot, tier: i.src.tier, aliases: i.aliases, excludeFromModes: i.exclude,
  values: valuesOf(data.itemColumns, i, data),
});

export function attributeCategories(data: GameData) {
  const cols = (entity: "hero" | "item", list: readonly Col[]) =>
    list.map((c) => ({
      key: c.key, entity, label: c.label, info: c.info, type: c.type, unit: c.unit ?? null, custom: !!c.custom, enabled: !c.disabled,
    }));
  return { hero: cols("hero", data.heroColumns), item: cols("item", data.itemColumns) };
}

export async function seanceCategories(withMembers = false) {
  const entities: SeanceEntity[] = ["hero", "item", "ability"];
  const [rows, ...tiles] = await Promise.all([loadCategoryRows(), ...entities.map(activeEntities)]);
  const idsOf = Object.fromEntries(entities.map((e, i) => [e, tiles[i].map((h) => h.id)])) as Record<SeanceEntity, number[]>;
  return rows.map((c) => {
    const comp = completeness(c.memberships, idsOf[c.entity as SeanceEntity] ?? []);
    return {
      id: c.id, key: c.key, entity: c.entity, type: c.type, label: c.label, explanation: c.explanation, difficulty: c.difficulty, status: c.status,
      source: c.source, flagged: c.flagged, flagReason: c.flagReason, memberCount: comp.members.length,
      complete: comp.complete, unknownIds: comp.unknown,
      ...(withMembers ? { memberIds: comp.members } : {}),
    };
  });
}

export async function globalState(include: Set<string>) {
  const data = await loadGameData();
  const today = todayDate();
  const meta = await dayMeta(today);
  const out: Record<string, unknown> = {
    generatedAt: new Date().toISOString(), today,
    modes: ALL_MODES,
    locks: LOCKS.map((l) => ({ ...lockInfo(l), today: meta.find((m) => m.slug === l.slug) ?? null })),
  };
  if (include.has("categories")) out.attributeCategories = attributeCategories(data);
  if (include.has("seance")) out.seanceCategories = await seanceCategories(include.has("members"));
  if (include.has("heroes")) out.heroes = data.heroes.map((h) => heroView(h, data));
  if (include.has("abilities")) out.abilities = data.abilities.map((a) => abilityView(a, data));
  if (include.has("items")) out.items = data.items.map((i) => itemView(i, data));
  return out;
}

export async function entityState(kind: string, id: number) {
  const data = await loadGameData();
  if (kind === "heroes") {
    const h = data.hero(id);
    if (!h) throw new HttpError(404, "Unknown hero");
    return { kind: "hero", ...heroView(h, data), abilities: data.abilitiesOf(h.id).map((a) => abilityView(a, data)) };
  }
  if (kind === "abilities") {
    const a = data.ability(id);
    if (!a) throw new HttpError(404, "Unknown ability");
    return { kind: "ability", ...abilityView(a, data) };
  }
  if (kind === "items") {
    const i = data.item(id);
    if (!i) throw new HttpError(404, "Unknown item");
    return { kind: "item", ...itemView(i, data) };
  }
  throw new HttpError(404, "Unknown entity kind (heroes, abilities, items)");
}

/** The entire state of one lock on one day: record, frozen payload, answer pool, leak check and what can edit it. */
export async function puzzleState(slug: string, dateIn: string | null) {
  const lock = LOCK_BY_SLUG[slug];
  if (!lock) throw new HttpError(404, `Unknown lock "${slug}". Slugs: ${LOCKS.map((l) => l.slug).join(", ")}`);
  const date = dateIn ?? todayDate();
  if (!isDay(date)) throw new HttpError(422, "date must be YYYY-MM-DD");
  const [row, data] = await Promise.all([db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } }), loadGameData()]);
  const today = todayDate();
  const payload = (row?.payload ?? null) as BasePayload | null;
  const isOmen = lock.group === "omens";

  let pool: unknown = null;
  if (lock.mode && MODES[lock.mode] && !isOmen && !lock.box) {
    try { pool = poolRows(lock, data, date); } catch { pool = null; }
  }
  let leaks: unknown = null;
  if (payload && !row?.sealed && MODES[lock.mode] && !isOmen && !lock.box) {
    try { leaks = checkLeaks(payload); } catch { leaks = null; }
  }

  return {
    lock: lockInfo(lock),
    date, isToday: date === today, isFuture: date > today, isPast: date < today,
    puzzle: row
      ? {
          exists: true, sealed: row.sealed, sealedReason: row.sealedReason, overridden: row.overridden, answerId: row.answerId,
          dataVersion: row.dataVersion, updatedAt: row.updatedAt.toISOString(),
          // Omen scenarios are large and have their own tooling; everything else is returned in full.
          payload: isOmen ? "(omitted: Omen scenarios are inspected in /admin/omens)" : payload,
        }
      : { exists: false },
    answerPool: pool,
    leakCheck: leaks,
    editing: {
      tagEdits: "PATCH /api/agent/v1/entities/{heroes|abilities|items}/{id} (aliases, excludeFromModes, values, setup)",
      categories: lock.mode === "classic" || lock.mode === "item-classic" ? "POST/PATCH /api/agent/v1/categories (attribute columns of this lock)" : null,
      seance: !!lock.box ? "POST/PATCH /api/agent/v1/seance/categories (the groups this table is built from)" : null,
      puzzle: date > today ? "POST /api/agent/v1/puzzles/" + slug + " {date, action: regenerate | override}" : "Today's and past puzzles are read-only through the API.",
    },
  };
}
