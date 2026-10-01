// Usage: npm run import:castsounds
// Imports every hero's ability cast sounds from the wiki "Sounds" pages (The Resonance): downloads, measures, mirrors, approves.
import "dotenv/config";
import { importAllCastSounds } from "../src/lib/wiki/herosounds";
import { db } from "../src/lib/db";

(async () => {
  const r = await importAllCastSounds();
  for (const x of r) console.log(JSON.stringify(x));
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
