# GUESSLOCK

A fan-made daily guessing game for Valve's Deadlock: 30 "locks" per day (guessing games, 3 Omens, 3 sorting tables, a hero grid and two word games), same for every player, reset at 00:00 Europe/Zurich. Plus Endless practice, hard mode and The Black Market for spending souls.
Live at `guesslock.paulkuehn.ch`. Specs in [`prompts/`](prompts/) (open work in [`prompts/todo/`](prompts/todo/), finished prompts in [`prompts/done/`](prompts/done/)): [`guesslock-build-prompt.md`](prompts/guesslock-build-prompt.md) (data & engine),
[`guesslock-design-prompt.md`](prompts/guesslock-design-prompt.md) (design & gameflow),
[`guesslock-addendum-emoji-quote.md`](prompts/guesslock-addendum-emoji-quote.md) (The Cipher & The Echo),
[`guesslock-addendum-omens.md`](prompts/guesslock-addendum-omens.md) (The Omens; data findings in [`docs/omens-data-spike.md`](docs/omens-data-spike.md)),
[`guesslock-addendum-resonance.md`](prompts/guesslock-addendum-resonance.md) (The Resonance; data findings and defaults in [`docs/resonance-data-spike.md`](docs/resonance-data-spike.md)),
[`guesslock-addendum-seance.md`](prompts/guesslock-addendum-seance.md) (The Séance).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma 7 + Postgres (Neon) · Motion · Zod · Vitest.
Accounts are optional (Neon Auth): signed-in players get server-recorded plays, streaks, leaderboards and The Black Market; guests and
signed-out players keep their progress in `localStorage`. Agent API for puzzle state and curation: [`docs/agent-api.md`](docs/agent-api.md).

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
| XXIII | The Shadow | hero silhouette, zooms out per wrong guess (server-rendered steps) | API (second transparent portrait) |
| XXIV | The Arsenal | weapon silhouette, in colour after 4 wrong guesses | **only curated** weapon cut-outs (/admin/setup → The Arsenal); sealed until one exists |
| XXV | The Calculus | guess the hero from the tooltip stats (cooldown, cast range, duration, charges…) of all four of their abilities | API (`abilityStats`, every ability needs 2+ stats) |
| XXVI | The Decoy | spot the fake item in a hero's core build (3 picks) | analytics API (fake: < 1% on this hero, ≥ 3% elsewhere) |
| XXVII | The Cache | match a real team's six final inventories to its heroes (4 submissions) | Omen match harvest |
| XXVIII | The Constellation | 3×3 grid: a hero per cell fitting its row and column (hero search, 4 lives, heroes can be taken off again; warns when the grid can't be finished) | Reckoning columns + approved Séance hero groups |
| XXIX | The Lexicon | guess a Deadlock name as one word, Wordle rules (6 tries; "hero / item / ability" after 3 wrong) | hero, item and ability names, A–Z only (`src/lib/words/corpus.ts`) |
| XXX | The Crossword | a seeded crossword of 6–8 names, clued by redacted lore and descriptions; Check locks right words in, a check with a wrong word costs a pick (4) | same word list; clues that name any word of the grid are dropped (`src/lib/words/`) |

Numerals XXIII+ were added after the Séance family so existing ones never change; the Vault shows each with its group.

Everything opens automatically; the admin is optional (corrections, rewrites, overrides). The exceptions are
The Cipher, which stays **Sealed** until at least one hero has an emoji set; The Resonance, which stays Sealed
until at least one ability has approved clips (1 cast + 2 total; see below); and each Séance table, which stays
Sealed until the admin has approved enough complete categories for it. Numbering/names/hints live in `src/locks.config.ts`;
attribute columns in `src/lib/engine/columns.ts`; strings in `src/lib/i18n/`.

## Setup

```bash
npm install                 # also runs prisma generate (.npmrc sets legacy-peer-deps: @neondatabase/auth beta peer ranges conflict)
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET (production: see "Security and scaling notes")
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
- **Puzzle**: an ability with ≥ 1 approved wiki cast clip (the ability slot is shown). Clip 1 → a second cast variant after 1 wrong
  guess → a third after 2. Bonus: name the ability; its name is sent only after the bonus pick. Settings: *Skip sound locks*
  (not counted anywhere), *Sound locks volume*.

**Categories** (`/admin/categories`) holds the attribute columns of The Reckoning and The Appraisal: rename, reorder or
switch off the built-in (API) columns, fix single values per hero or item in a spreadsheet-style grid, and add custom
categories (Role and Height ship empty). A category that isn't from the API joins the puzzle once every hero or item in
the pool has a value.

**Hard mode** (`hard: true` in `locks.config.ts`, a `hard` variant in the mode): a second puzzle per day with its own
answer for every lock that has a hard clue (`HARD_LOCKS`, slug `<lock>-hard`, generated by the same daily job and never
the same answer as the normal lock). It opens once the normal lock of that day is finished (the account's record is the
proof, checked in `/api/play`), is always played with the hard clue and pays 1.5× souls. The "Hard mode" switch under the
Vault's intro shows the hard puzzles as red boxes below the normal ones and adds a "Play hard mode" button next to
"Next lock" on a finished lock. Hidden categories (Reckoning, Appraisal), black and white portrait (Visage), turned icon (Sigil), no
ability path (Belongings), turned and black and white (Relic), hidden stat values (Measure), tighter silhouettes (Shadow, Arsenal),
one omitted stat per ability (Calculus), no hero (Decoy), blank items (Cache). Hard puzzles are not part of "x / N locks",
the share or the streak.

**Earning souls** (The Black Market, "Want to earn more souls?"): ranked plays; a **daily login reward** (3% of a day's income on day 1,
1.5% more per day up to ten days, a quarter of a day on top every 7th day; the streak breaks when a day is missed; the Vault shows a claim bar);
**invitations** (a signed link `/invite/<token>`: when the friend has finished a ranked lock the friend gets 15% of a day's income and the
inviter 25%, up to 25 invitations); set bonuses. Daily and invitation payments go to the wallet only (they never count for the
leaderboards) and are recorded in the soul ledger (`daily`, `invite-in`, `invite-out`), claimed under an advisory lock.

**Clue images** (`src/lib/image/`): every reveal step of The Visage, Sigil, Relic, Ascension, Shadow and Arsenal
is its own image rendered on the server (crop, blur, tile cover, silhouette) and stored under a salted,
per-puzzle id. The browser only ever holds what the step shows, and a clue never shares a URL with the guess list.

**Endless** (`/endless`, `src/lib/endless.ts`): any guessing lock, a new puzzle every time, frozen in `EndlessPuzzle` under
a random token and played through the same evaluator. Never counted; pruned after 7 days by the daily cron.

**The Black Market** (`/market`, `/inventory`, `src/lib/market/`): signed-in players spend souls earned in ranked play on cases (odds
shown, souls only, never money) and Collector's Crates, and collect shop items, hero cards, weapons, abilities, map objects, lock
seals and flair (titles, name colours, Vault themes). Duplicates are kept as spares, any item can be sold, sets pay a one-time
bonus, and the Collectors board ranks the worth of a collection (see "Duplicates and Collector's Crates" below). There is no
trading between players. The other leaderboards rank souls earned, so spending never costs a place. `npm run check:market -- --yes`
checks the money paths (parallel purchases, stacks, crates, daily and invite rewards) against a database: it creates and
removes two throwaway profiles, so run it on a development branch, never on production.

**Guests:** a visitor who is neither signed in nor a guest sees a welcome screen first ("Sign in", "Create an account", "Play as guest").
Guests (a `gl_guest` session cookie, kept in `src/lib/guest.ts`) can play every lock and Endless, but nothing is saved to an account;
the Black Market and the leaderboards need an account.

Hints are the same in every guessing lock: the answer's first letter, then its first two letters, at the unlock points
set in `src/locks.config.ts` (`LETTER_HINTS`).

Admin tools: **Data coverage** (`/admin/coverage`: answer pool, no-repeat window and sealed days per lock) and **Debug
preview** (`/admin/debug`: any lock, any day, any reveal step, normal or hard, as players see it, with leak check).

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
  and finished locks stay as they were.
- **Ranked vs. unranked:** a lock counts for leaderboards only if it was played on its own day, one guess per request, while
  signed in. Plays brought in from a device's local history (`/api/account/sync`, runs once per browser session) count for
  personal stats only.
- **Boards:** Today, This week (Mon–Sun), All time (total souls), Streaks, Collectors (worth of the collection). Players can hide
  themselves. Rankings are cached for 30 s per server instance; the public API never returns internal user ids.
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

**Curation** (emojis, species, categories, voice entries, clip metadata, text edits, Séance groups) is snapshotted daily
(`curation-latest`) and by `npm run backup:curation`; `npm run restore:curation [-- <file|key>] [--audio]` loads one back
(additive upserts; `--audio` re-downloads approved clips whose audio isn't mirrored). **Players** without an account can
download and restore a backup of their progress in Settings; accounts sync automatically. Player tables (`Profile`,
`Play`, wallets, items) are covered by Neon's point-in-time restore, not by files in this repository.

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
7-day calendar, candidate pool, tuning and inspector. The same harvested timelines feed The Cache.

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

## Security and scaling notes

**Before production** (the checklist)
- Environment on the host: `DATABASE_URL` (pooled), `DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `ADMIN_PASSWORD`,
  `SESSION_SECRET`, `CRON_SECRET`, `PUZZLE_SALT`, `TRUSTED_PROXY_HOPS`, `DB_POOL_MAX`; optional `AGENT_API_*` tokens (the agent API is off
  without them) and `ALERT_WEBHOOK_URL`. All are listed in `.env.example`; secrets should be 32+ random characters.
- Migrations run on the Vercel build (`prisma migrate deploy`); with Docker run `npm run db:migrate` first.
- After a deploy: `/api/health` is 200, the daily crons are listed in the Vercel dashboard, and `[ratelimit] shared store unavailable`
  does not appear in the logs (it means the `RateLimit` table is missing).
- Set a private `PUZZLE_SALT` (the default is in the repository, so upcoming puzzles could be derived from it) and a long
  `SESSION_SECRET`. Invite links are signed with `SESSION_SECRET` (or `NEON_AUTH_COOKIE_SECRET`), never with the salt; changing
  either secret invalidates links already shared.
- Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app: 1 on Vercel, 0 if the container is reachable directly.
  Rate limits key on the client address taken that many hops from the right of `X-Forwarded-For`; with the wrong value a client
  could pick its own address.
- `ADMIN_DEBUG` is ignored in production builds. The Docker image runs as the unprivileged `node` user.

**Where it stops scaling, and what to do**
- *Rate limits*: the sensitive, low-volume paths (admin login, the agent API, market writes, account export and sync) are counted
  in Postgres (`RateLimit` table, `lib/server/sharedlimit.ts`), so they hold across instances and deploys; if the database can't
  be reached they fall back to the instance's own counter. The hot paths (`/api/play`, `/api/endless`, `/api/omen`, the
  leaderboard) stay in memory (`lib/server/ratelimit.ts`): a database call per guess would cost more than the abuse it stops, so
  with N instances their effective limit is N times higher. For a large fleet put those behind an edge rate limit or Redis.
  The daily cron prunes finished counters.
- *Leaderboards* are rankings over all players, computed once per 30 s per instance and shared by concurrent requests
  (`getBoard`), so the Hall page costs a few queries per half minute, not per visit. Beyond tens of thousands of players, move them
  to a precomputed table refreshed by cron.
- *Database connections*: `DB_POOL_MAX` per instance (default 10). On Vercel/serverless use the pooled `DATABASE_URL` and a low
  value (2-5) so many instances don't exhaust Neon's connection limit.
- *Mirrored images and sounds* are served from Postgres with a long immutable cache header, so a CDN absorbs nearly all traffic;
  put one in front (Vercel does this).
- *Daily cron* (`/api/cron/sync`, 300 s) is a single job; it is the thing to watch as the sound and wiki imports grow.

## Scripts

`npm run test` · `typecheck` · `lint` · `sync` · `generate [-- --days N]` · `backup [-- --days N]` · `omens:harvest [-- --minutes N]` · `validate:leaks [-- --all]` ·
`import:voicelines [-- --hero <id>]` · `import:sounds [-- --measure <s>]` · `make:grain` · `check:market -- --yes` · `check:hard` ·
`sim:collection` (Monte Carlo of finishing the collection)

`/styleguide` shows every component in every state (dev only; set `ENABLE_STYLEGUIDE=1` to enable in production). `robots.txt` and
`sitemap.xml` are generated (`src/app/robots.ts`, `sitemap.ts`); the admin, the API and the account pages are disallowed.

## Credits & license notes

Game data, analytics and The Resonance's sound files (hosted by them): [deadlock-api.com](https://deadlock-api.com). Voice line transcriptions: [Deadlock Wiki](https://deadlock.wiki),
CC BY-NC-SA 4.0 (attributed on `/about` and in The Echo's rules). Fan-made, not affiliated with or endorsed by Valve.
Deadlock and all related assets © Valve Corporation.

**The soul economy** (`src/lib/game/economy.ts`): a typical player (3.5 guesses, 0.3 hints per puzzle, the lock weights in
`locks.config.ts`) earns about 1,900 souls by finishing every lock of a day. A Cursed Vault costs about that; the other cases a
share of it (a tenth to two thirds), and item values, set bonuses, the daily reward and invitations scale with it, so every
case keeps its payout ratio (about 70-82% in items). Change an assumption there and everything follows.

**Duplicates and Collector's Crates** (`src/lib/market/catalog.ts`): a duplicate is kept as a spare copy (a stack, "× 3") instead of
being scrapped. Selling the last copy pays 60% of an item's value, a spare more: 75% for the first spare, 85% for the second,
95% from the third on ("Sell spares" sells all but the oldest copy at once). The best spare rate stays below what any case
pays back on average (tested), so reselling doubles never makes cases free money. The collection and the Collectors board
count distinct items only. A Collector's Crate (one per rarity) only holds items you don't own yet and costs 2× their average
value (never less than the dearest of them or 1.25× the cheapest case), re-priced on the server at purchase. `npm run
sim:collection` simulates the cheapest way to own everything: about 3.7 million souls before (about 5 years of full days), about
0.77 million now (about 1.1 years).
