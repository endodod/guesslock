// Usage: npm run sync:wiki [-- --minutes 10]
// Same job as the daily cron: re-imports the wiki voice and sound pages that changed (the first run imports everything).
import "dotenv/config";
import { dailyWikiSync } from "../src/lib/wiki/daily";
import { db } from "../src/lib/db";

(async () => {
  const i = process.argv.indexOf("--minutes");
  const minutes = i > 0 ? Number(process.argv[i + 1]) : 10;
  console.log(JSON.stringify(await dailyWikiSync(Date.now() + minutes * 60_000), null, 1));
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
