# Handoff: finish merging The Resonance + The Séance, then push to main

> Written 2026-10-02 at the end of a session that ran out of budget mid-merge. Read this fully before touching git.

## Current git state (don't lose it)

- Repo: `C:\Users\anmel\GithubRepos\guesslock`. The checked-out branch is **`integrate/new-modes`**, created from `main` @ `6ef6b20` (in sync with `origin/main` at the time).
- On it, already committed locally (not pushed):
  - `4e38024`: merge of `feature/resonance` into current main, conflicts resolved. See the commit message; it also removed the accidental `.claude/worktrees/*` gitlinks and ignored `.claude/worktrees/`.
- **In progress, uncommitted:** `git merge --no-ff --no-commit feature/seance`. All 14 textual conflicts are resolved and staged (`git add -A` was run). **Don't run `git merge --abort`**, or the resolutions are lost.
- Source branches (each with one commit of agent work on top of its spec commit): `feature/resonance` (`411704f`) and `feature/seance` (`ed66ccd`). Their agent worktrees live in `.claude/worktrees/agent-*` (now git-ignored). Remove them with `git worktree remove` once merged.

## What was already decided and done in the Séance merge

1. **Admin route clash:** `main` already has `/admin/categories` (custom Reckoning/Appraisal attribute categories). The Séance editor was moved to **`/admin/seance`** (`src/app/admin/seance/{page,actions}.tsx`, `[id]/`, `preview/`). All Séance links were retargeted, `main`'s categories pages were kept unchanged, and the nav has a "Séance" entry in the site-wide row.
2. **DB model clash:** `main` already has `model Category` (key/entity/label…, table exists in Neon). The Séance models were renamed to **`SeanceCategory`** and **`SeanceMembership`**, in:
   - `prisma/schema.prisma` (valid, formatted)
   - `prisma/migrations/20261002090000_seance/migration.sql` (tables, indexes and FK renamed)
   - `db.seanceCategory` / `db.seanceMembership` in `src/lib/seance/library.ts`, `src/app/admin/seance/actions.ts` and `src/app/admin/seance/[id]/page.tsx`
3. **Numbering:** Resonance = X, Shop XI–XIV, Omens XV–XVII, **Séance = XVIII** (`src/locks.config.ts`: table locks + `SEANCE_BOX`).
4. **Skip sound locks + Séance folding combined** in:
   - `src/lib/game/scoring.ts`: `dayTotals(results, seanceInPlay, skip?)`, and `shareDay` takes both `seanceInPlay` and `skip`
   - `src/lib/client/store.ts`: `daySouls(day, ignore = new Set(), pred = live)`
   - `src/components/Vault.tsx`: `countedLocks` + `dayStreaks` + `unitCount` = vault units minus skipped
   - `src/components/Ledger.tsx` imports
5. Texts: README (18 locks, table incl. XVIII), onboarding in `en.ts` (18 locks), `how-to-play` (18 locks, 14 guessing games). Admin status page links per lock with the Séance table label.
6. **Earlier in the Resonance merge:** The Resonance follows main's "letter hints everywhere". It uses `LETTER_HINTS(4, 6)`; the gun sound is a **clue step after 3 wrong guesses** (`clue.gun` in the payload, not a hint); the slot/archetype hints were dropped. The Resonance tests were updated accordingly.

## Remaining work (in order)

1. **Fix the remaining TypeScript errors** (`npx prisma generate` then `npx tsc --noEmit`). They all come from the model rename. Séance code still uses the Prisma types of main's `Category`:
   - `src/lib/seance/library.ts` (~l.27, 35–36): `Prisma.CategoryWhereInput` → `Prisma.SeanceCategoryWhereInput`; the `CategoryRow` type must include `memberships` (use `include: { memberships: true }` where rows are loaded).
   - `src/app/admin/seance/page.tsx` (~l.19–20): same, rows need `include: { memberships: true }`.
   - `src/app/admin/review/page.tsx` (~l.45, 53): the Séance review block queries `db.category` with `status`/`memberships`. Change it to `db.seanceCategory` (the block came from the Séance branch; `main`'s own review code doesn't use categories).
   - Grep all of `src/` for any remaining `db.category` / `categoryMembership` / `Prisma.Category*` inside Séance code (`src/lib/seance`, `src/components/seance`, `src/app/admin/seance`, `src/app/admin/review`, `src/app/admin/calendar`, `src/lib/sync/assets.ts`, `src/lib/engine/generate.ts`, `scripts/`). Main's `db.category` usages (`admin/categories`, `engine/context.ts`, `engine/columns.ts`, `admin/setup`) must stay.
2. `npx eslint src scripts`, then `npx vitest run`. Expect test updates:
   - Resonance "Skip sound locks" tests assert `LOCKS` length 17 and "1/16 locks", "2/17 locks". With the Séance merged, `LOCKS` has 21 entries (4 Séance tables), and share/vault counts use **vault units** (18; 17 when skipping sound).
   - Séance tests may assert numeral XVII. Now XVIII.
3. **Verify against a LOCAL DB, never Neon.** Use e.g. `postgresql://postgres@localhost:5432/guesslock_merged` (local Postgres 18, user `postgres`, no password): `CREATE DATABASE`, then set `DATABASE_URL` and `DIRECT_URL` for the commands only. Run `npx prisma migrate deploy`, `npm run sync`, `npm run generate`, `npm run validate:leaks` and `npm run build`, and smoke-test `/`, `/lock/resonance`, `/lock/seance-mechanics`, `/admin/sounds`, `/admin/seance` and `/admin/categories` (main's). If `npm install` fails with "reading 'edgesOut'", use `npx --yes npm@latest install` (bug in the global npm 11.4.1).
4. **Commit the merge** on `integrate/new-modes`. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
5. **Push:** the user asked to push both modes to `main`. Fast-forward `main` to `integrate/new-modes` (`git switch main && git merge --ff-only integrate/new-modes`), then `git push origin main`.
   - Deploys run migrations on build (main commit `dc36ff4`), so the two additive migrations (`…_resonance`, `…_seance` with `SeanceCategory`/`SeanceMembership`) will be applied to Neon then.
   - Check that the migration folder names sort after main's latest migration.
   - After deploying, confirm `/api/health` and that both new locks show "Sealed" (expected: no content yet), not errors.

## Follow-ups after the push (content/product, not code blockers)

- **The Resonance:** nothing plays until clips are approved in `/admin/sounds` (~110 abilities have suggestions). The first real listen in a real browser is still unverified (headless tests had no audio). Also unverified: iOS silent-switch behaviour, the cron `dailySoundSync` on Vercel, and signed-in play. Known limitation: mirrored audio bytes equal the upstream file (content-matchable).
- **The Séance:**
  - All mechanics categories are drafts. Approve them in `/admin/seance`, but consider leaving "projectile" (25 heroes) and "movement" (20) unapproved; they overlap everything.
  - Classify **Rem** by hand before the archetype/weapon-type categories become complete.
  - Visuals and Lore need hand-curated categories (no data source); until then those tables and Mixed are sealed.
  - Unverified: signed-in recording/leaderboards for tables, the loss reveal animation, the Mixed table with real categories, and clipboard share.
- **Numbering:** the Séance spec text says XVIII (now correct). The Resonance spec's §1 numbering is also correct.
- Both agent data spikes: `docs/resonance-data-spike.md`; Séance defaults are documented in README.
