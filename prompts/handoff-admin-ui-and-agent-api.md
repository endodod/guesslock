# Handoff: finish the admin redesign check + build the agent API

> Written 2026-10-01 when the session was stopped on request. Branch: `feature/admin-ui-agent-api` (from `main` @ `2b5ecda`). Read the whole file before touching code.

## 0. Vercel 404 (diagnosed and fixed in code; one manual step left for the owner)

- **Symptom:** `guesslock.paulkuehn.ch` (every path, incl. `/api/health`) answers Vercel's plain-text `NOT_FOUND`.
- **Cause:** *every* production build since the accounts merge failed (GitHub deployment statuses for `0830079` … `2b5ecda` all say "failure"), so no production deployment exists. Reproduced locally: with `NEON_AUTH_COOKIE_SECRET` / `NEON_AUTH_BASE_URL` unset, `next build` dies in "Collecting page data" with `Missing required config: cookies.secret`, because `src/lib/auth/server.ts` called `createNeonAuth()` at import time.
- **Fix (done, commit "Make accounts optional at build time"):** the auth client is now created lazily; `authConfigured()` guards `currentUser()`, the `/api/auth/*` handlers (503 when off) and `src/proxy.ts` (redirects `/account` to `/` when off). Verified: `next build` succeeds with both variables blank.
- **Owner step (needed for accounts to work in production):** in Vercel → Settings → Environment Variables add, for **Production** (and Preview if used):
  - `NEON_AUTH_BASE_URL` (the Neon Auth URL, ends in `/neondb/auth`) and
  - `NEON_AUTH_COOKIE_SECRET` (32+ random chars).
  Both are in the git-ignored `.env.vercel` in the repo root. Then redeploy.
- **Env checklist** (what the code reads; present in the owner's project as of the screenshot: PUZZLE_TIMEZONE, PUZZLE_SALT, LAUNCH_DATE, SITE_URL, DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET):
  - missing for accounts: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`
  - optional: `ALERT_WEBHOOK_URL`, `DEADLOCK_API_KEY` (raises replay limits), `ADMIN_SETUP_MODE`, `AGENT_API_READ_TOKEN`, `AGENT_API_WRITE_TOKEN`, `AGENT_API_ALLOW_APPROVE`
  - **must NOT be set in production:** `ADMIN_DEBUG` (adds a login shortcut), `ENABLE_STYLEGUIDE`
  - "Needs Attention" badges in Vercel only suggest marking secrets as *Sensitive*; they are not errors.
- If the next build still fails, read its log: `npx vercel inspect <deployment id> --logs` (needs `vercel login`) or the Vercel dashboard → Deployments → the failed one. The build runs `prisma generate && node scripts/migrate-on-build.mjs && next build`; `migrate-on-build` needs `DIRECT_URL` or `DATABASE_URL` on Vercel.

## 1. Admin redesign (code done, **not visually verified**)

Done (typecheck + lint clean): `src/app/admin/admin.css` (scoped theme: re-colors the Tailwind neutral/blue/red/green/amber palettes inside `body.admin-ui`, so all existing admin pages pick it up; tables, inputs, buttons, cards), `AdminNav.tsx` (dark sidebar, grouped nav, active highlight, mobile drawer), `layout.tsx` (sidebar + content), `kit.tsx` (`PageHeader`, `Card`, `Stat`, `Pill`), redesigned `page.tsx` (stat tiles, quick actions, lock tiles, runs table), login page, restyled `ActionButton`.

To do:
1. **Look at it.** Start the dev server on a free port, log in with `ADMIN_PASSWORD`, and screenshot `/admin/login`, `/admin`, `/admin/heroes`, `/admin/review`, `/admin/seance` at 1440 px and 390 px (script: log in via the form, `playwright-core` + Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`). The earlier attempt failed only because a dev server was already running (Next allows one per project: stop it or use that one).
2. Fix what looks off. Likely spots: Tailwind palette overrides not applying (utilities must reference `var(--color-neutral-*)`; if they don't, retheme with explicit selectors), table header corner radii, the `details` summary in the sidebar, long lock names.
3. Optionally adopt `PageHeader`/`Card` in the other pages (heroes, review, texts…) instead of relying on the CSS only.

## 2. Agent API (partly built)

**Goal:** the owner's agents can read the *entire state of a puzzle* (a lock on a day) and edit what drives it: tags (aliases, excluded modes, category values, hero build pins), create categories (Reckoning/Appraisal attribute categories and Séance groups), and regenerate/override future puzzles. Must be secure.

Already in the repo (all typecheck, nothing uses them yet):
- `src/lib/config.ts`: `agentReadToken`, `agentWriteToken`, `agentMayApprove` (env `AGENT_API_READ_TOKEN`, `AGENT_API_WRITE_TOKEN`, `AGENT_API_ALLOW_APPROVE`).
- `src/lib/agent/guard.ts`: `guard(req, "read"|"write")`, `readBody(req, zodSchema)`, `json`, `fail`, `isDryRun`, `audit`. Security model (keep it): two separate bearer secrets of 32+ chars (write also reads); no config → 404 for the whole API; Authorization header only; constant-time compare; failed attempts throttled per client (10/min) + 300 ms delay; rate limit per token (120 read / 30 write per minute, in memory); body ≤ 200 KB; strict zod; `no-store`; no CORS; every write logged as a `SyncRun` row of kind `agent-api` (shows on `/admin` → Recent runs).
- `src/lib/agent/errors.ts`: `HttpError(status, message, extra?)`.
- `src/lib/agent/schemas.ts`: strict request schemas `EntityPatch`, `CategoryCreate`, `CategoryPatch`, `MemberEdit`, `SeanceCreate`, `SeancePatch`, `PuzzleAction`.
- `src/lib/agent/state.ts`: `globalState(include)`, `entityState(kind, id)`, `puzzleState(slug, date)` (lock info, DailyPuzzle row incl. full payload, answer pool via `poolRows`, `checkLeaks`, and which calls can edit it), `attributeCategories`, `seanceCategories`.

To build:
1. `src/lib/agent/ops.ts` (writes; each takes `dryRun`, returns a before/after summary, throws `HttpError` on bad input):
   - `patchEntity(kind: heroes|abilities|items, id, EntityPatch)`: aliases/excludeFromModes accept a full list or `{add, remove}` (dedupe case-insensitively; modes must be a known `lock.mode`); `values` (heroes/items only) validated against `data.heroColumns` / `data.itemColumns` and applied with `saveCategoryValues(entity, edits, data)` from `src/lib/admin/categories.ts` (returns `{changed, invalid}`); hero `setup.buildPin/buildBan` merged into `Hero.setup` (item class names must exist; see `parseSetup`). Abilities: aliases + exclude only (no attrs). Writes: heroes by `id`, abilities/items by `BigInt(id)`. After a write: `revalidateTag("catalog", { expire: 0 })`; if aliases changed on a hero/ability, run `syncTexts()` from `src/lib/sync/assets.ts` via `after()` from `next/server` (it re-redacts texts; too slow to await).
   - `createAttributeCategory` / `patchAttributeCategory`: mirror `addCategory` / `saveCategory` in `src/app/admin/categories/actions.ts` (key = `entity.slug-of-label`, not clashing with built-in columns; order after the last one). No delete through the API.
   - `createSeanceCategory` / `patchSeanceCategory` on `db.seanceCategory` / `db.seanceMembership`: new groups are `source: "curated"`, `status: "draft"`; `members.add` → member true, `notMembers` → false, `remove` → unknown, `completeRest` → every still-unknown active hero becomes false; heroes must be active; ≥ 4 members; report `completeness()`. `status: "approved"` only if `config.agentMayApprove` **and** the group is complete, else 403/422. Never let agents delete.
   - `puzzleAction(slug, {date, action, answerId?})`: **only for dates after today** (never today/past): `regenerate` = delete a non-overridden row then `generateDay(date, { slugs: [slug], force: true })` (like `buildDay` in `src/app/admin/puzzles/actions.ts`); `override` = `overridePuzzle(date, slug, answerId)` (fails for Séance/Omens, which have no answer list).
2. Routes under `src/app/api/agent/v1/` (every handler: `const g = await guard(req, scope); if ("res" in g) return g.res;` wrap the body in try/catch mapping `HttpError` → `fail(status, msg, extra)`; unknown errors → 500 without details; call `audit(g.who, req, summary)` after each real (non-dry-run) write):
   - `route.ts` GET index (endpoint list + scopes + docs link)
   - `state/route.ts` GET `?include=heroes,abilities,items,categories,seance,members,locks` (default: locks, categories, seance)
   - `puzzles/[slug]/route.ts` GET `?date=YYYY-MM-DD` (read) and POST (write, `PuzzleAction`)
   - `entities/[kind]/[id]/route.ts` GET (read) and PATCH (write)
   - `categories/route.ts` GET (read) and POST (write); `categories/[entity]/[key]/route.ts` PATCH
   - `seance/categories/route.ts` GET/POST and `seance/categories/[id]/route.ts` GET/PATCH
   - Support `?dryRun=1` on every write.
3. Docs for agents: `docs/agent-api.md` (auth header, every endpoint with a curl example, error codes, the "never today/past, drafts only, no deletes" rules).
4. Tokens: generate two different 32+ char secrets (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), add them to `.env.example` (blank), the local `.env`, and `.env.vercel`; tell the owner to add them in Vercel. **Don't print them in chat.**
5. Tests (`src/tests/agent.test.ts`, vitest, no DB): token checks (disabled / short token / wrong token / read token on a write route / throttle), body schema rejections (unknown field, huge list, bad mode), alias/exclude list edits (`add`/`remove`/replace, dedupe), approve gate, "future dates only" rule. Then browser/curl test against a **local** database only.
6. Final checks: `npx tsc --noEmit`, `npx eslint src scripts`, `npx vitest run`, `npx next build` (use `DATABASE_URL` pointing to a local DB so `migrate-on-build` doesn't touch Neon; it only migrates when `VERCEL=1` or `MIGRATE_ON_BUILD=1`).

Never run migrations, syncs or writes against the Neon database from a dev session unless the owner asks.
