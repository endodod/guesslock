# GUESSLOCK

A fan-made daily guessing game for Valve's Deadlock: 18 "locks" per day (14 guessing games, 3 Omens and The Séance), same for every player, reset at 00:00 Europe/Zurich.
Live at `guesslock.paulkuehn.ch`. Specs in [`prompts/`](prompts/): [`guesslock-build-prompt.md`](prompts/guesslock-build-prompt.md) (data & engine),
[`guesslock-design-prompt.md`](prompts/guesslock-design-prompt.md) (design & gameflow),
[`guesslock-addendum-emoji-quote.md`](prompts/guesslock-addendum-emoji-quote.md) (The Cipher & The Echo),
[`guesslock-addendum-omens.md`](prompts/guesslock-addendum-omens.md) (The Omens; data findings in [`docs/omens-data-spike.md`](docs/omens-data-spike.md)),
[`guesslock-addendum-resonance.md`](prompts/guesslock-addendum-resonance.md) (The Resonance; data findings and defaults in [`docs/resonance-data-spike.md`](docs/resonance-data-spike.md)),
[`guesslock-addendum-seance.md`](prompts/guesslock-addendum-seance.md) (The Séance).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma 7 + Postgres (Neon) · Motion · Zod · Vitest.
No accounts: player progress lives in `localStorage`.

## Locks

| # | Lock | Mode | Source |
|---|---|---|---|
| I | The Reckoning | hero attributes | API; species + release date columns appear once filled in for every hero |
| II | The Visage | zoomed portrait | API |
| III | The Sigil | ability icon under tiles (+ bonus) | API |
| IV | The Testament | redacted lore | API, automatic redaction |
| V | The Incantation | redacted ability description (+ bonus) | API, automatic redaction |
| VI | The Belongings | most distinctive items (analytics) | analytics API |
| VII | The Ascension | ability upgrade texts | API, automatic redaction |
| VIII | The Cipher | 6 emojis | **only curated** (emoji set per hero in /admin) |
| IX | The Echo | voice lines (text only, Deadlock Wiki) | wiki, imported automatically by the daily job |
| X | The Resonance | ability sound (+ bonus); needs audio, skippable in Settings | deadlock-api sound index, **only admin-approved clips** (/admin/sounds) |
| XI | The Relic | blurred item icon | API |
| XII | The Appraisal | item attributes | API |
| XIII | The Lineage | build path (easy) | API |
| XIV | The Measure | hidden stat value (5 tries) | API |
| XV–XVII | The Clash / The Beast / The Rift | Omens: predict a real match | replays (see below) |
| XVIII | The Séance | sort 16 heroes into 4 hidden groups; four tables (Mechanics, Visuals, Lore, Mixed) in one box | **only approved categories** (/admin/seance) |

Everything opens automatically; the admin is optional (corrections, rewrites, overrides). The exceptions are
The Cipher, which stays **Sealed** until at least one hero has an emoji set; The Resonance, which stays Sealed
until at least one ability has approved clips (1 cast + 2 total; see below); and each Séance table, which stays
Sealed until the admin has approved enough complete categories for it. Numbering/names/hints live in `src/locks.config.ts`;
attribute columns in `src/lib/engine/columns.ts`; strings in `src/lib/i18n/`.

## Setup

```bash
npm install                 # also runs prisma generate (.npmrc sets legacy-peer-deps: @neondatabase/auth beta peer ranges conflict)
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET
npm run db:migrate          # apply migrations
npm run sync                # fetch heroes/items from api.deadlock-api.com, mirror images
npm run generate            # create today's + next 7 days' puzzles
npm run dev
```

Optionally run `npm run import:voicelines` once to fill The Echo right away (otherwise the daily job imports them
over a few days). In `/admin` (password = `ADMIN_PASSWORD`) you can add emoji sets, species/release dates, rewrites and overrides.
For The Resonance, run `npm run import:sounds` (or *Import sound index now* on `/admin/sounds`), then approve clips there.

### The Resonance (sounds)

- **Import** (`src/lib/sounds/`, daily in `/api/cron/sync`, `npm run import:sounds [-- --measure <s>]`): fetches
  `/v1/assets/sounds` (stored pruned to `abilities` + `weapons` as the `assets-sounds` snapshot), maps each active hero
  to its folders (`HeroSoundMap`: codename, squashed name or a name word — Abrams → `abrams`, Mo & Krill → `mokrill`,
  Lady Geist → `ghost` + `geist`; unreleased folders are ignored), and suggests clip → ability matches by file name.
  Whiz-bys, `_end` stingers, unmatched clips and clips under 250 ms are excluded (still visible, can be restored).
- **Measure**: WASM mpg123 (`mpg123-decoder`) decodes suggested clips within a time budget; loudness is the loudest
  400 ms RMS window, `gainDb` brings it to −20 dBFS with the peak kept ≤ −1 dBFS.
- **Curate** in `/admin/sounds`: per hero the folder mapping, per ability the clips (play, role, ability, ★ = clip 1 /
  preferred gun, approve/exclude). **Nothing unreviewed is used.** Approving downloads and mirrors the clip under a
  *salted* id (`sha1("sound:" + PUZZLE_SALT + ":" + url#etag)`), so players only get opaque `/media/<sha1>` URLs that
  can't be looked up from the public index. Re-imports keep admin decisions; a changed ETag sends an approved clip back
  to review (review queue), and its old mirror keeps working for frozen puzzles.
- **Puzzle**: an ability with ≥ 1 approved cast clip and ≥ 2 approved clips (no-repeat window on the hero). Clip 1
  muffled (client-side 700 Hz low-pass) → clear after 1 wrong guess → clip 2 after 2 → slot (3), gun clip (4; the weapon
  type as text if no gun clip is approved), archetype (6). Bonus: name the ability; its name is sent only after the
  bonus pick. Settings: *Skip sound locks* (not counted anywhere), *Sound locks volume*, hard mode *Muffled only*.

**Categories** (`/admin/categories`) holds the attribute columns of The Reckoning and The Appraisal: rename, reorder or
switch off the built-in (API) columns, fix single values per hero or item in a spreadsheet-style grid, and add custom
categories (Role and Height ship empty). A category that isn't from the API joins the puzzle once every hero or item in
the pool has a value.

Hints are the same in every guessing lock: the answer's first letter, then its first two letters, at the unlock points
set in `src/locks.config.ts` (`LETTER_HINTS`).

Set `ADMIN_SETUP_MODE=1` to turn on **Puzzle setup** (`/admin/setup`): a hero × mode overview of who is in each
answer pool (and why not), and a per-hero editor to switch each mode (or single abilities) on or off and to edit, add
or remove its clues: Reckoning attributes, a custom Visage portrait, lore/ability/upgrade texts, Belongings items to
always or never show, the Cipher emoji set and Echo voice lines (custom lines survive wiki re-imports). Edits apply to
newly generated puzzles; upcoming days with that hero can be rebuilt from the same page. With the flag off the pages
404 and the actions refuse.

## How it works

- **Sync** (`src/lib/sync/assets.ts`): fetch → validate each entity with Zod (bad entities are logged and excluded) →
  upsert → change detection (`needsReview`, shown in the admin review queue) → refresh redaction texts → mirror images into
  Postgres (served from `/media/<sha1>`, so puzzles survive upstream URL changes and URLs don't reveal names).
- **Daily engine** (`src/lib/engine/`): seeded RNG from `(date, lock, salt)`, no-repeat window `min(60, pool × 0.6)`
  (The Lineage: 10 days), each mode's eligibility filter, and a frozen JSON snapshot per `DailyPuzzle` row — a mid-day
  patch never changes today's puzzle. Future days are pre-generated; admins can override any day.
- **Play** (`/api/play`): stateless — the client sends its guesses, the server recomputes the view from the frozen
  snapshot, so locked clue content never reaches the browser.
- **Redaction** (`src/lib/text/`): automatic pass (names, aliases, ability names, possessives, accents), used directly.
  An admin rewrite replaces it; if the source text changes later, the rewrite is marked stale and the fresh automatic text is used.
- **Leak check**: `npm run validate:leaks` fails if any scheduled puzzle shows the answer's name or aliases.

## Accounts & leaderboards (optional for players)

- **Identity:** Neon Auth (Managed Better Auth), enabled via `neon.ts` (`auth: true`) + `neon deploy`. Users/sessions live in
  the `neon_auth` schema; GUESSLOCK's own tables are `Profile`, `Play` and `UserStats`. Code: `src/lib/auth/`, `src/lib/accounts/`.
- **Sign-in:** email + password, or a one-time code by email (also used for password recovery). Pages under `/auth/*`,
  account page `/account` (protected by `src/proxy.ts`), leaderboards at `/hall`.
- **Recording:** when signed in, `/api/play` records every guess server-side. Guesses are append-only, finished locks are frozen,
  and the "no hints" choice is fixed at the first guess (hint values are then never sent).
- **Ranked vs. unranked:** a lock counts for leaderboards only if it was played on its own day, one guess per request, while
  signed in. Plays brought in from a device's local history (`/api/account/sync`, runs once per browser session) count for
  personal stats only.
- **Boards:** Today, This week (Mon–Sun), All time (total souls), Streaks. Players can hide themselves.
- **Data rights:** `/api/account/export` (JSON download) and account deletion (profile, plays, stats and the Neon Auth user,
  in one transaction).
- **Before production:** add the site origin as a trusted domain (`neon neon-auth domain add https://…`; done for
  `guesslock.paulkuehn.ch`), set `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` on the host, and configure custom SMTP in
  Neon (the shared sender is for development).

## Operations

| Job | Endpoint | Schedule |
|---|---|---|
| Asset sync (+ top up puzzles) | `GET /api/cron/sync` | daily (`vercel.json`: 02:00 UTC) |
| Voice line import + puzzle generation | `GET /api/cron/generate` | daily (`vercel.json`: 14:00 UTC); imports heroes not yet (or >30 days ago) imported, within a 150 s budget |
| Health | `GET /api/health` | monitor it: 503 if the last sync failed, is >36 h old, or today has no puzzle |

Cron endpoints need `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically when `CRON_SECRET` is set).
Set `ALERT_WEBHOOK_URL` (Discord/Slack) to get alerts on sync failures and days without puzzles.

The schedule fits Vercel Hobby (cron jobs at most once per day, ±59 min). Exact timing doesn't matter:
puzzles are generated 7 days ahead. Functions are pinned to `fra1`, next to the Neon database (eu-central-1).

### API outage backup

The site keeps running for at least a week if deadlock-api or the wiki goes down:

- **Puzzles** are generated 7 days ahead and frozen in `DailyPuzzle`. Images and audio are mirrored into Postgres.
- **Every API response** the app uses (heroes, items, client version, The Belongings' usage stats) is stored in
  `ApiSnapshot` whenever a call succeeds. Puzzle generation falls back to it while the API is down; snapshots older
  than `API_BACKUP_MAX_DAYS` (default 14) aren't used.
- **A fresh database** can be filled even during an outage: when there are no heroes yet, the asset sync falls back to
  the gzipped copies in `data/api-backup/` (committed; shipped with Vercel functions and the Docker image).
- A failed sync never touches existing data, so an outage only means no new heroes or items until it's over.

Refresh the backup with `npm run backup`: it fetches everything live, stores it in the database, rewrites
`data/api-backup/`, and generates puzzles 8 days ahead. Commit the updated files.

### The Omens (XV–XVII)

Omens freeze a moment from a real high-rank match and ask what happens next. They need exact per-second data
(net worth, HP, level, ultimates, midboss and rift state), which only the match **replay** has. deadlock-api runs SQL
against replays (`/v1/matches/demo/query`), so the pipeline is:

1. **Discover**: recent high-rank matches (average badge ≥ 100) that have a replay (about 1 in 5 do, and the share
   drops as matches age).
2. **Query**: three replay queries per match (players per second, game-rules changes, midboss spawns), plus metadata.
3. **Build**: a per-second timeline -> detected moments (Clash: fights with and without deaths; Beast: midboss kills
   and survived pit visits; Rift: every rift) -> frozen scenarios with snapshot, reveal window and answer.
4. **Assign**: daily generation freezes one scenario per Omen per day (admin-approved first, else best quality, with a
   60/40 positive/negative mix for Clash and Beast).

The harvest is built into puzzle generation (`generateAhead`): before generating, it counts the days that still
lack an Omen, queues just enough matches (each gives one scenario per Omen), and processes them within a time
budget. So one Omen per mode per day is produced wherever generation runs: both daily cron jobs, *Generate* in the
admin and `npm run generate`. `npm run omens:harvest` and *Harvest now* on `/admin/omens` run it on their own.
Replay queries are limited to 20/h per IP; set `DEADLOCK_API_KEY` for 200/h (`OMEN_QUERIES_PER_HOUR` tunes the
budget). Details and data findings: [`docs/omens-data-spike.md`](docs/omens-data-spike.md). `/admin/omens` has the
7-day calendar, candidate pool, tuning and inspector. (A practice / endless mode is planned for later.)

**Seed:** `data/omens-seed.json.gz` holds real scenarios from harvested matches. When an Omen has no harvested stock
for a day (fresh install, a short harvest, an API outage), the unused seed scenarios are imported and used, so every
Omen still gets its daily puzzle. Refresh it with `npm run omens:seed` after a harvest and commit the file.

**Migrations and self-healing:** on Vercel the build runs `prisma migrate deploy` (`scripts/migrate-on-build.mjs`;
set `MIGRATE_ON_BUILD=1` to do the same elsewhere, or run `npm run db:migrate` before starting a Docker image). If a
visitor opens today's vault while a lock has no puzzle yet (a fresh deploy, a missed cron), generation for those locks
runs right after the response, at most once per 10 minutes.

### The Séance (XVII)

A Connections-style puzzle: 16 heroes, 4 hidden groups of 4. Code: `src/lib/seance/` (pure: `board.ts` solver and
generator, `play.ts` server checks, `scoring.ts`, `derive.ts`, `rules.ts`; DB: `library.ts`), UI in `src/components/seance/`.

- **Four tables, one box.** `seance-mechanics`, `seance-visuals`, `seance-lore` and `seance-mixed` are four normal locks
  (`box: "seance"` in `locks.config.ts`), each a frozen `DailyPuzzle` row, played through `/api/play` like every other lock
  (a submission is stored as `"id,id,id,id"`, a hint request as `"hint"`). The Vault shows them as one wide box that
  counts as one lock; the lock screen shows them as tabs.
- **Category library** (`Category`, `CategoryMembership`): a category is a yes/no set over all active heroes. A missing
  membership row means "unknown". Boards use only categories that are **approved** and **complete** (every active hero
  classified). A hero added by a sync has no row in curated categories, so they drop out until classified (review queue).
- **API-derived mechanics categories** (`derive.ts`) are refreshed by every asset sync: archetype, weapon type,
  complexity, hero tags, and an **allowlist** of player-facing ability behaviours (`CAN_HEAL_PLAYERS`, `ALLOW_SELF_CAST`,
  `MOVEMENT`, `PROJECTILE`), multiple charges, stuns, and two fixed health cuts (≥ 850, < 700). New ones (≥ 4 members) are
  created as **drafts**. When a sync changes members, the category is flagged with a diff; it only drops back to draft
  below 4 members. Missing API data (e.g. a hero without `hero_type`) is "unknown", never "no". Admin memberships always
  win over the API. Other behaviour flags are engine internals and never become categories.
- **Visuals and lore are curated only.** Nothing is seeded: those tables (and Mixed, which needs 3 category types) stay
  **Sealed** until the admin writes and approves categories.
- **Generation** (`board.ts`): seeded; picks 4 categories (preferring one per difficulty; Mixed takes 3+ types), then 4
  heroes each, aiming for a seeded target of 2–5 red herrings. A solver counts every valid split; the board is kept only
  with exactly **one** solution and **2–5** red herrings (600 attempts, else the table seals with the reason). Group colors
  rank difficulty + ½ per decoy (max +1.5), ties by category id: brass 🟨, ecto 🟩, sapphire 🟦, cursed 🟪.
- **Defaults chosen here** (the spec left them open):
  - No category repeats in the same table within `min(14, pool/4 − 1)` days, so a small library can still make boards.
    It also avoids categories another table uses that day. Both are soft: if no fresh board exists, recent categories are allowed.
  - The box is worth the rounded average of the tables **in play** that day (sealed tables don't count; unfinished count 0).
    Leaderboards, stats and the Ledger fold the tables the same way (`foldPlays`). The box counts as one lock opened once every table in play is finished.
  - One hint per table. It names the easiest group not yet solved at the moment it's used.
  - The Vault box links to the first unfinished table. After a wrong pick the selection stays (like Connections). Rank numerals (I–IV) are always shown on bands.
  - Colorblind palette: Okabe–Ito yellow / orange / sky blue / reddish purple with a stripe pattern. Reduced motion drops the slide/shake (fades only).
  - The frozen board has `source: "daily"` (and an optional `authorUserId`) for future community boards.
- **Admin:** `/admin/categories` (library by type/status, completeness, last use, new curated categories, derived-category
  review with approve/reject and sync diffs), `/admin/categories/<id>` (yes/no/unknown grid: portraits for visuals, lore on
  hover for lore), `/admin/categories/preview` (board for any date/table with solution, difficulty and red herrings;
  "Another board" rerolls, "Use this board" freezes it as an override). Incomplete categories, sync changes and sealed tables are in the review queue.
- **Leak check:** `npm run validate:leaks` also plays each Séance table (start, one group solved plus a wrong and a
  one-away pick) and fails if a label, explanation or membership of an unsolved group would be sent.

**Deploy:** Vercel (uses `vercel.json` crons) or Docker (`Dockerfile`, standalone output; schedule the cron URLs with any
scheduler). Point `guesslock.paulkuehn.ch` at it.

## Scripts

`npm run test` · `typecheck` · `lint` · `sync` · `generate [-- --days N]` · `backup [-- --days N]` · `omens:harvest [-- --minutes N]` · `validate:leaks [-- --all]` ·
`import:voicelines [-- --hero <id>]` · `import:sounds [-- --measure <s>]` · `make:grain`

`/styleguide` shows every component in every state (dev only; set `ENABLE_STYLEGUIDE=1` to enable in production).

## Credits & license notes

Game data, analytics and The Resonance's sound files (hosted by them): [deadlock-api.com](https://deadlock-api.com). Voice line transcriptions: [Deadlock Wiki](https://deadlock.wiki),
CC BY-NC-SA 4.0 (attributed on `/about` and in The Echo's rules). Fan-made, not affiliated with or endorsed by Valve.
Deadlock and all related assets © Valve Corporation.
