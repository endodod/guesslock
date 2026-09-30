import "dotenv/config";
import { runAssetSync } from "../src/lib/sync/assets";
import { db } from "../src/lib/db";

(async () => {
  const r = await runAssetSync();
  console.log(JSON.stringify({ id: r.id, status: r.status, diff: r.diff && { added: r.diff.added.length, removed: r.diff.removed.length, changed: r.diff.changed.length }, error: r.error }, null, 2));
  await db.$disconnect();
  process.exit(r.status === "ok" ? 0 : 1);
})();
