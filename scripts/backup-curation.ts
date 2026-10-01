// Usage: npm run backup:curation
// Dated curation backup: ApiSnapshot "curation-YYYY-MM-DD" plus a gzipped file in data/curation-backup/.
// (The daily cron keeps a rolling "curation-latest" in the database.)
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { db } from "../src/lib/db";
import { snapshotCuration } from "../src/lib/backup/curation";

(async () => {
  const key = `curation-${new Date().toISOString().slice(0, 10)}`;
  const { data, counts } = await snapshotCuration(key);
  const dir = path.join(process.cwd(), "data", "curation-backup");
  mkdirSync(dir, { recursive: true });
  const gz = gzipSync(JSON.stringify(data), { level: 9 });
  writeFileSync(path.join(dir, `${key}.json.gz`), gz);
  console.log(key, JSON.stringify(counts), `${(gz.length / 1024).toFixed(0)} KiB file`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
