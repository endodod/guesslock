// Usage: npm run omens:harvest [-- --minutes 10]
// Discovers recent high-rank matches with replays, runs the replay queries (rate limited) and builds
// Omen scenarios. Safe to run any time; it resumes pending work.
import "dotenv/config";
import { harvest } from "../src/lib/omens/harvest";
import { db } from "../src/lib/db";

(async () => {
  const i = process.argv.indexOf("--minutes");
  const minutes = i > 0 ? Number(process.argv[i + 1]) : 10;
  const res = await harvest(Date.now() + minutes * 60_000, (s) => console.log(s));
  console.log(res);
  const counts = await db.scenario.groupBy({ by: ["omen", "source", "status"], _count: true });
  for (const c of counts) console.log(`${c.omen.padEnd(6)} ${c.source.padEnd(9)} ${c.status.padEnd(10)} ${c._count}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
