// Usage: npm run restore:curation [-- <file.json.gz | snapshot key>]
// Restores a curation backup into the database (additive upserts; see src/lib/backup/restore.ts).
// Default: the newest file in data/curation-backup/. A key such as "curation-latest" reads the ApiSnapshot row instead.
import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { db } from "../src/lib/db";
import { restoreCuration, type CurationBackup } from "../src/lib/backup/restore";

async function load(arg: string | undefined): Promise<{ data: CurationBackup; from: string }> {
  if (arg && !existsSync(arg)) {
    const snap = await db.apiSnapshot.findUnique({ where: { key: arg } });
    if (!snap) throw new Error(`no file or snapshot named ${arg}`);
    return { data: snap.data as CurationBackup, from: `snapshot ${arg}` };
  }
  const dir = path.join(process.cwd(), "data", "curation-backup");
  const file = arg ?? path.join(dir, readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort().at(-1) ?? "");
  if (!existsSync(file)) throw new Error("no curation backup file found");
  return { data: JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")), from: file };
}

(async () => {
  const { data, from } = await load(process.argv[2]);
  console.log(`restoring ${from} (taken ${data.takenAt ?? "?"})`);
  console.log(JSON.stringify(await restoreCuration(data), null, 1));
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
