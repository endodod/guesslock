// Usage: npm run check:hard [-- YYYY-MM-DD]
// For every hard puzzle of a day (default today): does it start in hard mode, and does it really look different from the
// same puzzle played normally? Compares the clue before any guess and, where the clue is the same, the feedback to one wrong guess.
import "dotenv/config";
import { db } from "../src/lib/db";
import { HARD_LOCKS, LOCK_BY_SLUG } from "../src/locks.config";
import { todayDate, numberFor } from "../src/lib/day";
import { buildCatalog, lookupFor } from "../src/lib/engine/catalog";
import { evaluate } from "../src/lib/engine/play";
import { HARD_MULTIPLIER } from "../src/lib/game/scoring";
import { t } from "../src/lib/i18n/en";

(async () => {
  const date = process.argv[2] ?? todayDate();
  const catalog = await buildCatalog();
  let bad = 0;
  console.log(`Hard puzzles for ${date}\n`);
  for (const lock of HARD_LOCKS) {
    const row = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: lock.slug } } });
    const info = t.lock.hardInfo[lock.hardOf!] ?? "";
    if (!row || row.sealed) { console.log(`${lock.slug.padEnd(18)} NO PUZZLE (${row?.sealedReason ?? "not generated"})`); bad++; continue; }
    const lookup = lookupFor(catalog, lock.guess);
    const play = (l: typeof lock, guesses: string[]) => evaluate(l, row, numberFor(date), guesses, undefined, lookup);
    const hard = play(lock, []);
    // The same frozen puzzle as the normal lock would show it.
    const normalLock = { ...LOCK_BY_SLUG[lock.hardOf!], hardPlay: false };
    const normal = play(normalLock, []);
    const startsHard = hard.hard === true && !normal.hard;
    let differs = JSON.stringify(hard.clue) !== JSON.stringify(normal.clue) ? "clue" : "";
    if (!differs) {
      // Some hard modes only show in the feedback (hidden category tiles): try one wrong guess.
      const wrongId = (catalog[lock.guess === "item" ? "item" : lock.guess === "ability" ? "ability" : "hero"] ?? []).map((e) => e.id).find((id) => id !== row.answerId);
      if (wrongId && lock.guess !== "number" && !lock.input && lock.guess !== "match") {
        const h = play(lock, [wrongId]), n = play(normalLock, [wrongId]);
        if (JSON.stringify(h.rows) !== JSON.stringify(n.rows)) differs = "feedback";
      }
    }
    const ok = startsHard && differs !== "";
    if (!ok) bad++;
    console.log(`${lock.slug.padEnd(18)} ${ok ? "OK  " : "FAIL"} startsHard=${startsHard} differs=${differs || "no"}  — ${info}`);
  }
  console.log(`\n${HARD_LOCKS.length - bad}/${HARD_LOCKS.length} hard puzzles start hard and differ from normal play; souls ×${HARD_MULTIPLIER}.`);
  await db.$disconnect();
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
