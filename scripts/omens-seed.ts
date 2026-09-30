// Usage: npm run omens:seed
// Exports the unused daily Omen candidates (real harvested matches) to data/omens-seed.json.gz.
// The seed is the fallback stock when an Omen has no harvested scenario for a day (fresh install,
// a short harvest, an API outage). Commit the file after refreshing it.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { db } from "../src/lib/db";
import { SEED_FILE, type SeedScenario } from "../src/lib/omens/harvest";
import type { OmenKind, OmenPayload } from "../src/lib/omens/types";

(async () => {
  const rows = await db.scenario.findMany({
    where: { source: "daily", status: { in: ["candidate", "approved"] }, dailyDate: null },
    orderBy: [{ omen: "asc" }, { quality: "desc" }],
  });
  const seed: SeedScenario[] = rows.map((s) => ({
    id: s.id, omen: s.omen as OmenKind, matchId: Number(s.matchId), t: s.t, window: s.window, positive: s.positive,
    quality: s.quality, rank: s.rank, patch: s.patch, payload: s.payload as unknown as OmenPayload,
  }));
  const gz = gzipSync(JSON.stringify(seed), { level: 9 });
  writeFileSync(SEED_FILE, gz);
  const by = seed.reduce<Record<string, number>>((a, s) => ((a[s.omen] = (a[s.omen] ?? 0) + 1), a), {});
  console.log(`${seed.length} scenarios (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}), ${(gz.length / 1024).toFixed(0)} KiB`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
