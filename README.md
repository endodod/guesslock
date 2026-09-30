# GUESSLOCK

A fan-made daily guessing game for Valve's Deadlock: 17 "locks" per day (14 guessing games and 3 Omens), same for every player, reset at 00:00 Europe/Zurich.
Live at `guesslock.paulkuehn.ch`. Specs in [`prompts/`](prompts/): [`guesslock-build-prompt.md`](prompts/guesslock-build-prompt.md) (data & engine),
[`guesslock-design-prompt.md`](prompts/guesslock-design-prompt.md) (design & gameflow),
[`guesslock-addendum-emoji-quote.md`](prompts/guesslock-addendum-emoji-quote.md) (The Cipher & The Echo),
[`guesslock-addendum-omens.md`](prompts/guesslock-addendum-omens.md) (The Omens; data findings in [`docs/omens-data-spike.md`](docs/omens-data-spike.md)),
[`guesslock-addendum-resonance.md`](prompts/guesslock-addendum-resonance.md) (The Resonance; data findings and defaults in [`docs/resonance-data-spike.md`](docs/resonance-data-spike.md)).

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

Everything opens automatically; the admin is optional (corrections, rewrites, overrides). The exceptions are
The Cipher, which stays **Sealed** until at least one hero has a 6-emoji set, and The Resonance, which stays Sealed
until at least one ability has approved clips (1 cast + 2 total; see below). Numbering/names/hints live in `src/locks.config.ts`;
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

The harvest runs inside both daily cron jobs (and `npm run omens:harvest`, or *Harvest now* on `/admin/omens`) and
resumes pending work. Replay queries are limited to 20/h per IP; set `DEADLOCK_API_KEY` for 200/h and bigger practice
pools (`OMEN_QUERIES_PER_HOUR` tunes the budget). Details and data findings: [`docs/omens-data-spike.md`](docs/omens-data-spike.md).
Practice lives at `/omens/practice`; `/admin/omens` has the 7-day calendar, candidate pool, tuning and inspector.

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
