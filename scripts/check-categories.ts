// Usage: npm run check:categories
// Lists Constellation categories that say (nearly) the same thing, from different sources: "Gender: Female" from the
// Reckoning columns and the Séance group "Female heroes", say. Read-only. Pairs at RELATED_SIMILARITY or more (see
// constellation.ts) never share a grid; the list starts a little lower so near misses show up too.
import "dotenv/config";
import { loadGameData } from "../src/lib/engine/context";
import { heroCategories } from "../src/lib/engine/generate";
import { columnFacets, constellationFacets, similarity, RELATED_SIMILARITY, type Facet } from "../src/lib/engine/modes/constellation";

const SHOW = RELATED_SIMILARITY - 0.15;

(async () => {
  const data = await loadGameData();
  const groups = await heroCategories();
  const { pool, facets: usable } = constellationFacets(data, groups);
  const ids = new Set(pool.map((h) => h.id));
  const name = new Map(pool.map((h) => [h.id, h.name]));
  // Every category, before the size filter and de-duplication, so nothing is hidden.
  const all: Facet[] = [
    ...columnFacets(data, pool),
    ...groups.map((g) => ({ dim: `group:${g.key}`, label: g.label, info: g.info, members: new Set(g.members.filter((id) => ids.has(id))) })),
  ];
  const id = (f: Facet) => `${f.dim}|${f.label}`;
  const inUse = new Set(usable.map(id));
  console.log(`${pool.length} heroes, ${all.length} categories (${usable.length} usable in a grid)\n`);
  const list = (s: Iterable<number>) => [...s].map((id) => name.get(id) ?? id).join(", ") || "none";
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.dim === b.dim || !a.members.size || !b.members.size) continue;
      const o = similarity(a, b);
      if (o < SHOW) continue;
      n++;
      const onlyA = [...a.members].filter((h) => !b.members.has(h));
      const onlyB = [...b.members].filter((h) => !a.members.has(h));
      const tag = (f: Facet) => `${f.label} (${f.members.size}${inUse.has(id(f)) ? "" : ", unused"}) [${f.dim}]`;
      console.log(`${o >= RELATED_SIMILARITY ? "SAME" : "near"} ${(o * 100).toFixed(0)}%  ${tag(a)}  ~  ${tag(b)}`);
      if (onlyA.length) console.log(`      only in "${a.label}": ${list(onlyA)}`);
      if (onlyB.length) console.log(`      only in "${b.label}": ${list(onlyB)}`);
    }
  }
  console.log(`\n${n} pair${n === 1 ? "" : "s"} at ${(SHOW * 100).toFixed(0)}% or more.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
