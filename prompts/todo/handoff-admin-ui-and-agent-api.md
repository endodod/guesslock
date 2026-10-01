# Handoff: finish the admin page designs (§3a) and verify everything

> Updated 2026-10-01 at the end of a session that ran out of budget. **Current branch: `feature/admin-polish-agent-api-routes`** (4 commits + a WIP commit ahead of `main`; nothing of it is on `main` yet). Read the whole file, then do the checklist in §4.

## 1. What is DONE (don't redo)

- **Vercel 404:** solved and live (`vercel.json` pins `framework: nextjs`, `outputDirectory: .next`; the auth client is lazy so a missing Neon Auth setting can't fail the build). *Owner step still open:* add `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` (both in the git-ignored `.env.vercel`) to Vercel Production, else sign-in is unavailable. Env notes: never set `ADMIN_DEBUG` or `ENABLE_STYLEGUIDE` in production.
- **Admin shell** (on `main`): sidebar navigation (`AdminNav.tsx`), theme (`admin.css`), design pieces in `src/app/admin/kit.tsx` (`PageHeader`, `Card`, `Stat`, `Pill`), redesigned Status and Login pages.
- **Agent API v1: built, tested, documented** (commits `7a68fdc`, `6e07f86`, `153ea43` on this branch): routes under `src/app/api/agent/v1/` (index, state, puzzles/[slug], entities/[kind]/[id], categories, categories/[entity]/[key], seance/categories, seance/categories/[id]), `src/lib/agent/{guard,ops,schemas,state,errors}.ts`, `docs/agent-api.md`, `src/tests/agent.test.ts`, `.env.example` entries. Security model is as designed: two separate 32+ char bearer tokens (read / write), 404 when unset, constant-time compare, throttling, rate limits, 200 KB body cap, strict zod, audit rows (`SyncRun` kind `agent-api`), agents can't delete or touch today/past puzzles, and can only create *draft* Séance groups unless `AGENT_API_ALLOW_APPROVE` is set. Both token values already exist in the local `.env` and in `.env.vercel`. **Owner step:** add `AGENT_API_READ_TOKEN` and `AGENT_API_WRITE_TOKEN` to Vercel to switch the API on (without them it answers 404).
- **Route reachability (§3b)** (commit `e3f49ae`): the other agent fixed unreachable puzzle/admin pages (incl. Omens pages using `requireAdminPage()`) and added `scripts/check-routes.ts`. It has **not** been re-run after the page redesigns below.
- **Redesign of the list pages** (uncommitted before this handoff, now committed as WIP): `abilities`, `calendar`, `categories`, `heroes`, `items`, `review`, `seance` (list), `sounds`, `texts` (partly: only 3 kit uses) now use `PageHeader`/`Card`/`Pill`/`Stat`.

## 2. State of the working tree: it does NOT compile yet

At the last check: `npx vitest run` passes (141 tests), but

- `npx tsc --noEmit` fails:
  - `abilities/page.tsx:46`, `categories/page.tsx:75`, `seance/page.tsx:67`, `sounds/page.tsx:61`: a tone `"slate"` is passed to `Stat`, whose `tone` type only allows `"green" | "amber" | "red"`. Fix: widen `Stat`'s `tone` in `kit.tsx` to include `"slate"` (grey bar), or pick another tone.
  - `sounds/page.tsx:175`: `<ClipTable heroId abilities clips>` doesn't match `ClipTable`'s props (`rows`, `abilities: {id,name}[]`). Update the call or the component; keep the heroId-based grouping the redesign intended.
- `npx eslint src scripts` reports 5 errors and 6 warnings: `src/tests/agent.test.ts` lines 14, 15, 19, 20 use `any` (type them or add a narrow `eslint-disable`), plus a few unused-variable warnings in the redesigned pages. Re-run to see the full list.

## 3. What is LEFT (§3a: every admin page needs real visual design)

Pages still plain (no `PageHeader`/`Card`/`Pill`): **`heroes/[id]`**, **`omens`** and **`omens/[id]`**, **`puzzles`** (list) and **`puzzles/[slug]`**, **`seance/[id]`**, **`seance/preview`**, **`setup`** and **`setup/[id]`**; finish **`texts`**. Their client components keep their logic; restyle the markup only: `EmojiEditor`, `VoiceLineManager`, `OmenInspector`, `MembershipGrid`, `SetupClient`, `TextRow`, `ValuesGrid`, `CalendarCell`, `ClipTable`.

Design rules for each page (as before):
- Start with `PageHeader` (title, one-line subtitle, primary actions); content in `Card`s; `Stat` tiles for counts; `Pill` for every status (sealed/open, approved/draft, ok/failed, needs review): no bare-text status.
- Heroes/abilities/items: portrait or icon (`/media/<sha1>`), name + secondary line, tag chips (aliases, excluded modes) instead of comma-separated text.
- Tables: sticky header, hover rows, empty states, pending state on every `ActionButton`.
- Forms in cards with labels and hints; clear primary / secondary / destructive buttons; confirm destructive actions.
- `puzzles/[slug]`: show the lock like a preview (answer, clue, hints) plus the answer pool as a searchable grid with on/off toggles.
- Responsive to 390 px, no horizontal page scroll.

## 4. Checklist to finish (in order)

1. Make it compile: fix the §2 errors, then `npx tsc --noEmit && npx eslint src scripts && npx vitest run`.
2. Restyle the remaining pages (§3). Commit after each group (this repo's owner wants major changes committed on the feature branch automatically).
3. **Look at every admin page.** Start `npx next dev -p <free port>` (Next allows one dev server per project: stop any running one), log in with `ADMIN_PASSWORD` (the form posts to `/admin/login`), and screenshot every page at 1440 px and 390 px with `playwright-core` + Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`; install `playwright-core` in a temp folder, not in the project). Review the images and fix what looks plain or broken (Tailwind palette overrides in `admin.css`, table corners, sidebar `details`, long lock names). The dev server reads the `.env` database: browsing is read-only; don't click actions that sync or generate.
4. Re-run the route check: `npx tsx --tsconfig tsconfig.json scripts/check-routes.ts` (see the script header for flags) against a **local** database (`postgresql://postgres@localhost:5432/<db>`, then `npx prisma migrate deploy`, `npm run sync`, `npm run generate`), then once, read-only, against the deployed site. Everything should be 200 or an explained "Sealed".
5. Final checks: `npx tsc --noEmit`, `npx eslint src scripts`, `npx vitest run`, `npx next build` with `DATABASE_URL`/`DIRECT_URL` pointing at the local DB (the build runs `migrate-on-build`, which migrates whatever `DIRECT_URL`/`DATABASE_URL` points to when `VERCEL=1` or `MIGRATE_ON_BUILD=1`; neither is set locally, but keep Neon URLs out of the shell anyway).
6. Merge to `main` only when asked by the owner (`git switch main && git merge --no-ff feature/admin-polish-agent-api-routes`, then push; a push to `main` deploys to production). After merging, confirm the deployment: `https://api.github.com/repos/endodod/guesslock/deployments` shows `success`, and `/`, `/api/health`, `/admin/login` return 200.
7. When everything is done, move this file to `prompts/done/` and update `prompts/README.md`.

Never run migrations, syncs or writes against the Neon database from a dev session unless the owner asks.
