import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { normalizeAll } from "@/lib/deadlock/normalize";
import { deriveAll, memberCount } from "@/lib/seance/derive";
import { bazaarItems } from "@/lib/seance/derive-items";
import { unknownKeys } from "@/lib/seance/curated";
import { ABILITY_LOOKS, ITEM_LOOKS } from "@/lib/seance/curated-looks";
import { HERO_LOOKS } from "@/lib/seance/curated-visuals";
import { LORE_TAGS, HERO_RELEASE } from "@/lib/seance/derive-lore";
import { generateBoard } from "@/lib/seance/board";
import { ENTITY_TYPES, type LibraryCategory } from "@/lib/seance/types";
import { SEANCE_BOX_LIST } from "@/locks.config";
import { makeRng } from "@/lib/rng";
import { parseSubmission } from "@/lib/seance/play";

// The committed API backup (data/api-backup): the same data the daily sync derives the groups from.
const rd = (f: string) => JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "data/api-backup", f))).toString()).data;
const heroesRaw = rd("assets-heroes.json.gz");
const itemsRaw = rd("assets-items.json.gz");
const norm = normalizeAll(heroesRaw, itemsRaw);
const all = deriveAll(heroesRaw, itemsRaw);

const MIN_GROUPS = 16;

describe("Séance family: group library from the API data", () => {
  it("every entity and type has at least 16 usable, complete groups", () => {
    for (const entity of ["hero", "item", "ability"] as const)
      for (const type of ENTITY_TYPES[entity]) {
        const usable = all.filter((c) => c.entity === entity && c.type === type && memberCount(c) >= 4);
        expect(usable.length, `${entity}/${type}`).toBeGreaterThanOrEqual(MIN_GROUPS);
        // Completeness: every entity has an explicit yes or no in every group.
        for (const c of usable) expect([...c.members.values()].includes(null), `${c.key} has unknown members`).toBe(false);
      }
  });

  it("groups are neither tiny nor near-universal, and keys are unique", () => {
    const keys = new Set<string>();
    for (const c of all) {
      expect(keys.has(c.key), c.key).toBe(false);
      keys.add(c.key);
      const n = memberCount(c);
      if (n >= 4) expect(n, c.key).toBeLessThanOrEqual(c.members.size - 4);
    }
  });

  it("curated tables only name heroes, items and abilities that exist", () => {
    const heroes = new Set(norm.heroes.map((h) => h.name));
    const heroName = new Map(norm.heroes.map((h) => [h.id, h.name]));
    expect(unknownKeys(HERO_LOOKS, heroes)).toEqual([]);
    expect(unknownKeys(LORE_TAGS, heroes)).toEqual([]);
    expect([...heroes].filter((h) => !(h in HERO_RELEASE))).toEqual([]);
    expect(unknownKeys(ITEM_LOOKS, new Set(bazaarItems(norm).map((i) => i.name)))).toEqual([]);
    expect(unknownKeys(ABILITY_LOOKS, new Set(norm.abilities.map((a) => `${heroName.get(a.heroId)}: ${a.name}`)))).toEqual([]);
  });

  it("item names are unique (the looks table is keyed by name)", () => {
    const names = bazaarItems(norm).map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    const abilities = norm.abilities.map((a) => `${norm.heroes.find((h) => h.id === a.heroId)?.name}: ${a.name}`);
    expect(new Set(abilities).size).toBe(abilities.length);
  });
});

describe("Séance family: every table can produce fair boards", () => {
  const library = (entity: string): LibraryCategory[] =>
    all
      .filter((c) => c.entity === entity && memberCount(c) >= 4)
      .map((c, i) => ({
        id: i + 1, type: c.type, label: c.label, explanation: c.explanation, difficulty: c.difficulty,
        members: [...c.members].filter(([, v]) => v === true).map(([id]) => id),
      }));

  for (const box of SEANCE_BOX_LIST)
    for (const [table, label] of box.tables)
      it(`${box.name} · ${label}: 14 days of boards, exactly one solution each`, () => {
        const categories = library(box.entity);
        const tiles = (box.entity === "hero" ? norm.heroes.map((h) => h.id) : box.entity === "item" ? bazaarItems(norm).map((i) => i.id) : norm.abilities.map((a) => a.id));
        const byId = new Map(tiles.map((id) => [id, { id, name: String(id), image: null }]));
        const recent = new Set<number>();
        for (let day = 0; day < 14; day++) {
          const r = generateBoard({ table, entity: box.entity, categories, hero: (id) => byId.get(id), recent, rng: makeRng(`${box.id}|${table}|${day}`) });
          expect(r.ok, r.ok ? "" : r.reason).toBe(true);
          if (!r.ok) return;
          expect(r.payload.heroes).toHaveLength(16);
          expect(r.payload.groups).toHaveLength(4);
          expect(r.payload.redHerrings).toBeGreaterThanOrEqual(2);
          expect(r.payload.redHerrings).toBeLessThanOrEqual(5);
          r.payload.groups.forEach((g) => recent.add(g.categoryId));
          // A group repeats at most once per 14 days only when the pool is small: keep the window honest.
          if (recent.size > categories.length - 4) recent.clear();
        }
      });
});

describe("Séance family: ids of items and abilities", () => {
  it("a submission of four 10-digit ids is valid and fits the API limit", () => {
    const ids = [2948410412, 1080948381, 2414191464, 731943444];
    const entry = ids.join(",");
    expect(entry.length).toBeGreaterThan(40);
    expect(entry.length).toBeLessThanOrEqual(64);
    expect(parseSubmission(entry)).toEqual(ids);
  });
});
