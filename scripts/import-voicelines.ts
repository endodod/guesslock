// Usage: npm run import:voicelines [-- --hero <heroId>]
import "dotenv/config";
import { importAllVoiceLines, importHeroVoiceLines } from "../src/lib/wiki/voicelines";
import { db } from "../src/lib/db";

(async () => {
  const i = process.argv.indexOf("--hero");
  const log = (r: unknown) => console.log(JSON.stringify(r));
  if (i > 0) log(await importHeroVoiceLines(Number(process.argv[i + 1])));
  else await importAllVoiceLines(log);
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
