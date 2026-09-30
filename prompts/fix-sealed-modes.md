# Fix: The Cipher, The Clash, The Beast and The Rift show "Sealed — back tomorrow"

You are working in the guesslock repo (Next.js 16 App Router + Prisma 7 + Postgres). Read `AGENTS.md` first.
Four locks on today's vault are sealed: **cipher**, **clash**, **beast**, **rift**. Their code is complete on
`main`; the cause is in this environment's database or runtime. Find it and fix it. Do not change game rules.

## How it is supposed to work
- A lock is playable when `DailyPuzzle` has a row for (today, slug) with `sealed = false`. No row, or a sealed
  row, renders as "Sealed" in the vault (`src/lib/server/puzzles.ts` `dayMeta`, `src/components/Vault.tsx`).
- "Today" is the date in `PUZZLE_TIMEZONE` (default Europe/Zurich), see `src/lib/day.ts`.
- Rows are built by `generateDay(date, { slugs })` in `src/lib/engine/generate.ts`. Sealed rows for today or
  later are retried on every run; `status: "error"` results are logged as `[generate] <date> <slug>` and write
  no row.
- Self-healing: opening `/` or `/lock/<slug>` with a missing or sealed lock schedules `generateDay` for those locks
  after the response (`src/lib/server/heal.ts`, at most once per 10 minutes, logged as a `SyncRun` with
  `kind = "heal"`; failures are logged as `[heal] ...`).
- The Cipher needs heroes with 10 emojis; heroes without a full stored set use `DEFAULT_EMOJIS`
  (`src/lib/data/emojis.ts`, applied in `loadGameData` in `src/lib/engine/context.ts`).
- The Omens (clash/beast/rift) use `assignOmen` in `src/lib/omens/harvest.ts`: an approved or candidate
  `Scenario` from the harvest, else a bundled seed scenario from `data/omens-seed.json.gz` (`importSeed`).
  They need the tables from migration `20261001120000_omens` and later.

## Steps
1. `git pull origin main`, then `npm install` (the repo has `.npmrc` with `legacy-peer-deps=true`), then
   `npx prisma generate`.
2. `npx prisma migrate status`, then `npx prisma migrate deploy`. All migrations in `prisma/migrations`
   must be applied, in particular `..._api_snapshots`, `..._omens`, `..._play_omen`, `..._hero_setup` and
   `..._categories`. If one failed earlier, inspect the `_prisma_migrations` table, fix the cause,
   `npx prisma migrate resolve --rolled-back <name>` and deploy again. Note which database `DATABASE_URL` /
   `DIRECT_URL` point to (local, or the production Neon database) and tell the user.
3. Inspect today's rows. Use `npx prisma studio` or a small `tsx` script with the Prisma client:
   `DailyPuzzle` where `date = <today>` and `mode in (cipher, clash, beast, rift)`: which exist,
   `sealed`, `sealedReason`. Also check the latest `SyncRun` rows (`kind` = heal / generate / assets) for
   `status`, `error` and `counts`.
4. Run generation directly and read the output: `npm run generate` (runs `scripts/generate.ts`; it
   harvests Omen matches first for up to ~10 minutes, so it is fine to stop it once the per-lock results
   print). If you only want the four locks, write a throwaway `tsx` script that calls
   `generateDay(todayDate(), { slugs: ["cipher", "clash", "beast", "rift"] })` and prints the results.
   Every result should be `created`. For anything else, the `note` and the `[generate]` error say why.
5. Fix the root cause you find. Likely candidates, in order:
   - Missing migrations / stale Prisma client (errors mention an unknown table or column such as
     `Category`, `Scenario`, `OmenMatch`, `ApiSnapshot`, `Hero.setup`, `Hero.attrs`).
   - Cipher "no eligible answers": check that `loadGameData().heroes` has 10 emojis for most heroes and that
     no hero list excludes mode `emoji` (`Hero.excludeFromModes`).
   - Omens "no scenario": `data/omens-seed.json.gz` must exist and load. Check that `SEED_FILE` resolves to a
     real path (`process.cwd()` is the repo root in `npm run dev`; on Windows check the path joining) and that
     `importSeed("clash")` returns a scenario.
   - A timezone or date mismatch between the rows and `todayDate()`.
   - A sealed row that does not get retried: confirm the condition in `generateDay` for existing rows.
6. Verify: restart `npm run dev`, open `http://localhost:3000/`, and confirm that all four locks open and are
   playable. Open `/lock/cipher` and `/lock/clash` and play a guess or a lock-in. The admin page
   `/admin/puzzles` should show "ready" for today on all four. Echo may stay sealed locally if voice lines
   were never imported; that is expected and not part of this task.
7. Run `npm run typecheck`, `npm run lint` and `npm test`. Commit any code fix with a clear message and push
   to `main`. If the fix was only data or migrations (no code change), say so and don't commit.

Report back: the root cause, what you changed (code, migrations, data), which database was affected, and
the final state of today's four rows.
