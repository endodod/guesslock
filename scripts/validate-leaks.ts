// Checks every scheduled (today and future) puzzle for answer leaks. Exit code 1 on any leak.
// Usage: npm run validate:leaks [-- --all]   (--all also checks past days)
import "dotenv/config";
import { db } from "../src/lib/db";
import { todayDate } from "../src/lib/day";
import { checkLeaks } from "../src/lib/engine/leaks";
import type { BasePayload } from "../src/lib/engine/mode";
import { getLock } from "../src/locks.config";
import { seanceLeaks } from "../src/lib/seance/play";

(async () => {
  const all = process.argv.includes("--all");
  const rows = await db.dailyPuzzle.findMany({
    where: { sealed: false, ...(all ? {} : { date: { gte: todayDate() } }) },
    orderBy: [{ date: "asc" }, { mode: "asc" }],
  });
  let bad = 0;
  for (const r of rows) {
    const lock = getLock(r.mode);
    // The Séance: no label or membership of an unsolved group may reach the browser.
    if (lock?.box === "seance") {
      const leaks = seanceLeaks(lock, r);
      if (leaks.length) {
        bad++;
        console.log(`LEAK ${r.date} ${r.mode}:`);
        for (const l of leaks) console.log(`   ${l}`);
      }
      continue;
    }
    // The Omens have their own server-side reveal (src/lib/omens/serve.ts).
    if (lock?.group === "omens") continue;
    const leaks = checkLeaks(r.payload as unknown as BasePayload);
    if (leaks.length) {
      bad++;
      console.log(`LEAK ${r.date} ${r.mode} (${(r.payload as unknown as BasePayload).answer.name}):`);
      for (const l of leaks) console.log(`   "${l.term}" in: ${l.text}`);
    }
  }
  console.log(`${rows.length} puzzles checked, ${bad} with leaks.`);
  await db.$disconnect();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
