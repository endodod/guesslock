// Usage: npm run import:sounds [-- --measure <seconds>]
// Imports deadlock-api's sound index for The Resonance (suggestions only; approve clips in /admin/sounds),
// then measures pending suggested clips for up to --measure seconds (default 120; 0 skips it).
import "dotenv/config";
import { importSounds, measurePending } from "../src/lib/sounds/import";
import { db } from "../src/lib/db";

(async () => {
  const i = process.argv.indexOf("--measure");
  const seconds = i > 0 ? Number(process.argv[i + 1]) : 120;
  const r = await importSounds();
  console.log(JSON.stringify(r, null, 2));
  if (seconds > 0) console.log(await measurePending(Date.now() + seconds * 1000));
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
