// Usage: npm run backup [-- --no-files] [-- --no-generate] [-- --days 8]
// Captures every external API response the app depends on, so it keeps running through an outage:
//   1. fetches all endpoints live and stores them in ApiSnapshot (the runtime fallback),
//   2. writes gzipped copies to data/api-backup/ (commit them: they cover a fresh database),
//   3. makes sure puzzles are generated at least --days ahead (default 8).
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fetchClientVersion, fetchHeroItemStats, fetchHeroes, fetchItems, fetchMap } from "../src/lib/deadlock/api";
import { BACKUP_DIR } from "../src/lib/deadlock/snapshots";
import { generateAhead } from "../src/lib/engine/generate";
import { db } from "../src/lib/db";

const KEYS = ["assets-heroes", "assets-items", "assets-steam-info", "assets-map", "analytics-item-stats", "analytics-hero-stats"];

(async () => {
  const arg = (f: string) => process.argv.includes(f);
  const i = process.argv.indexOf("--days");
  const days = i > 0 ? Number(process.argv[i + 1]) : 8;
  const started = new Date();

  // Live fetches only: a backup must never be refreshed from an older backup.
  await Promise.all([fetchHeroes(), fetchItems(), fetchClientVersion(), fetchMap(), fetchHeroItemStats()]);
  const rows = await db.apiSnapshot.findMany({ where: { key: { in: KEYS } } });
  const stale = KEYS.filter((k) => !rows.some((r) => r.key === k && r.fetchedAt >= started));
  if (stale.length) throw new Error(`not refreshed from the live API: ${stale.join(", ")}`);
  for (const r of rows) console.log(`snapshot ${r.key.padEnd(22)} ${(r.byteSize / 1024).toFixed(0).padStart(6)} KiB  ${r.url}`);

  if (!arg("--no-files")) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    for (const r of rows) {
      const file = path.join(BACKUP_DIR, `${r.key}.json.gz`);
      const gz = gzipSync(JSON.stringify({ key: r.key, url: r.url, fetchedAt: r.fetchedAt.toISOString(), data: r.data }), { level: 9 });
      writeFileSync(file, gz);
      console.log(`file     ${path.relative(process.cwd(), file)} ${(gz.length / 1024).toFixed(0)} KiB`);
    }
  }

  if (!arg("--no-generate")) {
    const res = await generateAhead(days);
    const bad = res.filter((r) => !["created", "exists"].includes(r.status));
    const last = res.map((r) => r.date).sort().at(-1);
    console.log(`puzzles  generated through ${last}${bad.length ? `; not ready: ${bad.map((r) => `${r.date}/${r.slug} (${r.status})`).join(", ")}` : ""}`);
  }
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
