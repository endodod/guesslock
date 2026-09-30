// Usage: npm run generate [-- --days 7]
import "dotenv/config";
import { generateAhead } from "../src/lib/engine/generate";
import { db } from "../src/lib/db";

(async () => {
  const i = process.argv.indexOf("--days");
  const days = i > 0 ? Number(process.argv[i + 1]) : undefined;
  const res = await generateAhead(days);
  const byDate: Record<string, string[]> = {};
  for (const r of res) (byDate[r.date] ??= []).push(`${r.slug}:${r.status}${r.note ? `(${r.note})` : ""}`);
  for (const [d, list] of Object.entries(byDate)) console.log(d, "\n  " + list.join("\n  "));
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
