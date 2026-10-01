// Usage: npm run import:herovoice
// Imports select lines, ability cast lines and complete conversations of every hero from the wiki (The Echo family).
import "dotenv/config";
import { importAllHeroVoice } from "../src/lib/wiki/herovoice";
import { db } from "../src/lib/db";

(async () => {
  const r = await importAllHeroVoice();
  for (const x of r) console.log(JSON.stringify(x));
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
