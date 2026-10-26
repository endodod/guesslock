// Usage: npm run media:offload [-- --dry-run]
// Moves the bytes of mirrored media still stored in Postgres into the object store (MEDIA_S3_*, see
// src/lib/objectstore.ts), then clears them from their rows. Safe to re-run: each row is cleared only after its object
// was written, and rows already moved are skipped. Reading the bytes out counts once against Neon's network transfer.
import "dotenv/config";
import { db } from "../src/lib/db";
import { objectStoreEnabled, putObject } from "../src/lib/objectstore";

const dryRun = process.argv.includes("--dry-run");
const BATCH = 16;

(async () => {
  if (!objectStoreEnabled()) throw new Error("set MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY first");
  const pending = await db.mirroredAsset.aggregate({ where: { bytes: { not: null } }, _count: true, _sum: { byteSize: true } });
  console.log(`${pending._count} assets (${((pending._sum.byteSize ?? 0) / 1048576).toFixed(1)} MB) still in Postgres`);
  if (dryRun) return db.$disconnect();
  let moved = 0, after = "";
  for (;;) {
    const rows = await db.mirroredAsset.findMany({
      where: { bytes: { not: null }, id: { gt: after } }, orderBy: { id: "asc" }, take: BATCH,
      select: { id: true, contentType: true, bytes: true },
    });
    if (!rows.length) break;
    await Promise.all(rows.map(async (r) => {
      await putObject(r.id, r.bytes!, r.contentType);
      await db.mirroredAsset.update({ where: { id: r.id }, data: { bytes: null }, select: { id: true } });
    }));
    moved += rows.length;
    after = rows[rows.length - 1].id;
    console.log(`${moved}/${pending._count}`);
  }
  console.log(`${moved} assets moved to the object store`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
