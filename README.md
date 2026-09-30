# GUESSLOCK

A fan-made daily guessing game for Valve's Deadlock: 13 "locks" per day, same for every player, reset at 00:00 Europe/Zurich.
Live at `guesslock.paulkuehn.ch`. Specs in [`prompts/`](prompts/): [`guesslock-build-prompt.md`](prompts/guesslock-build-prompt.md) (data & engine),
[`guesslock-design-prompt.md`](prompts/guesslock-design-prompt.md) (design & gameflow),
[`guesslock-addendum-emoji-quote.md`](prompts/guesslock-addendum-emoji-quote.md) (The Cipher & The Echo),
[`guesslock-addendum-omens.md`](prompts/guesslock-addendum-omens.md) (The Omens; data findings in [`docs/omens-data-spike.md`](docs/omens-data-spike.md)).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma 7 + Postgres (Neon) · Motion · Zod · Vitest.
No accounts: player progress lives in `localStorage`.

## Locks

| # | Lock | Mode | Needs curation? |
|---|---|---|---|
| I | The Reckoning | hero attributes | species + release date per hero |
| II | The Visage | zoomed portrait | – |
| III | The Sigil | ability icon under tiles (+ bonus) | – |
| IV | The Testament | redacted lore | approve lore texts |
| V | The Incantation | redacted ability description (+ bonus) | approve description texts |
| VI | The Belongings | most distinctive items (analytics) | – |
| VII | The Ascension | ability upgrade texts | approve T1–T3 texts |
| VIII | The Cipher | 6 emojis | emoji set per hero |
| IX | The Echo | voice lines (text only, Deadlock Wiki) | run voice import, review |
| X | The Relic | blurred item icon | – |
| XI | The Appraisal | item attributes | – |
| XII | The Lineage | build path (easy) | – |
| XIII | The Measure | hidden stat value (5 tries) | – |

Locks without eligible answers show as **Sealed** until curated. Numbering/names/hints live in `src/locks.config.ts`;
attribute columns in `src/lib/engine/columns.ts`; strings in `src/lib/i18n/`.

## Setup

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET
npm run db:migrate          # apply migrations
npm run sync                # fetch heroes/items from api.deadlock-api.com, mirror images
npm run generate            # create today's + next 7 days' puzzles
npm run dev
```

Then open `/admin` (password = `ADMIN_PASSWORD`) and curate: hero species/release dates, emoji sets, text approvals,
and **Import voice lines** (takes a few minutes; it's polite to the wiki).

## How it works

- **Sync** (`src/lib/sync/assets.ts`): fetch → validate each entity with Zod (bad entities are logged and excluded) →
  upsert → change detection (`needsReview`, shown in the admin review queue) → refresh redaction texts → mirror images into
  Postgres (served from `/media/<sha1>`, so puzzles survive upstream URL changes and URLs don't reveal names).
- **Daily engine** (`src/lib/engine/`): seeded RNG from `(date, lock, salt)`, no-repeat window `min(60, pool × 0.6)`
  (The Lineage: 10 days), each mode's eligibility filter, and a frozen JSON snapshot per `DailyPuzzle` row — a mid-day
  patch never changes today's puzzle. Future days are pre-generated; admins can override any day.
- **Play** (`/api/play`): stateless — the client sends its guesses, the server recomputes the view from the frozen
  snapshot, so locked clue content never reaches the browser.
- **Redaction** (`src/lib/text/`): automatic pass (names, aliases, ability names, possessives, accents) → admin review.
  Only approved/rewritten text is ever shown; source changes after approval mark the text stale.
- **Leak check**: `npm run validate:leaks` fails if any scheduled puzzle shows the answer's name or aliases.

## Operations

| Job | Endpoint | Schedule |
|---|---|---|
| Asset sync (+ top up puzzles) | `GET /api/cron/sync` | daily (`vercel.json`: 02:00 UTC) |
| Puzzle generation | `GET /api/cron/generate` | daily (`vercel.json`: 14:00 UTC), a second chance if the sync run failed |
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

**Deploy:** Vercel (uses `vercel.json` crons) or Docker (`Dockerfile`, standalone output; schedule the cron URLs with any
scheduler). Point `guesslock.paulkuehn.ch` at it.

## Scripts

`npm run test` · `typecheck` · `lint` · `sync` · `generate [-- --days N]` · `backup [-- --days N]` · `validate:leaks [-- --all]` ·
`import:voicelines [-- --hero <id>]` · `make:grain`

`/styleguide` shows every component in every state (dev only; set `ENABLE_STYLEGUIDE=1` to enable in production).

## Credits & license notes

Game data and analytics: [deadlock-api.com](https://deadlock-api.com). Voice line transcriptions: [Deadlock Wiki](https://deadlock.wiki),
CC BY-NC-SA 4.0 (attributed on `/about` and in The Echo's rules). Fan-made, not affiliated with or endorsed by Valve.
Deadlock and all related assets © Valve Corporation.
