# Build Prompt: GUESSLOCK — Deadlock Daily Guessing Game

> Name: **GUESSLOCK** (guesslock.paulkuehn.ch). Design, UX and gameflow are defined in `guesslock-design-prompt.md`.

## Role & goal

You are building a fan-made, Wordle/LoLdle-style daily guessing game for Valve's **Deadlock**. It has **11 modes** in two groups: Hero modes and Item modes. Every mode has one puzzle per day, and the puzzle is the same for every player. The game must survive frequent patches: heroes, items and stats change often, and heroes get added and removed. **Never hardcode game data.** Pull it from the community API, snapshot it, and curate only what the API doesn't provide.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- Deployed on a `paulkuehn.ch` subdomain
- No user accounts in v1. Store progress, streaks and stats in `localStorage`.

## Data sources

- **Assets API:** `https://api.deadlock-api.com/v1/assets/*`. The old `assets.deadlock-api.com` host is dead, so do not use it.
  - `/v1/assets/heroes?only_active=true&language=english`: heroes, abilities, portraits, lore
  - `/v1/assets/items?language=english`: items, abilities, icons, stats, components, tiers
- **Analytics API:** `https://api.deadlock-api.com/v1/analytics/*`, used for per-hero item stats in "Whose Build".
- **Before writing any parser, fetch the OpenAPI spec and real responses.** Do not assume field names. Derive TypeScript types (plus Zod schemas) from actual payloads.
- Filtering:
  - Heroes: active, player-selectable heroes only. Exclude test heroes (e.g. `hero_testhero`) and disabled heroes.
  - Items: `type=upgrade` in the weapon/vitality/spirit slots, not disabled. Exclude Street Brawl-only legendaries.
  - Abilities: only abilities belonging to eligible heroes.
- Respect rate limits: server-side fetching only, with caching. The client never calls the API directly.

## Data pipeline

1. **Sync job** (cron, e.g. every 6h, plus manual trigger): fetch assets → validate with Zod → upsert into Postgres. Store the `client_version`/build number with each sync.
2. **Mirror images** (portraits, icons, ability videos if used) to own storage/CDN so puzzles don't break when upstream URLs change.
3. **Curation layer** (DB tables + admin page): stores data the API lacks or that needs human work:
   - Hero attributes not in the API: gender, species, weapon type, release date
   - Rewritten/redacted lore and ability descriptions
   - Per-entity flags: `excludeFromMode[]`, `needsReview`
4. **Change detection:** when a sync adds, removes or changes a hero/item, flag it as `needsReview` in the admin page. New heroes are not eligible as answers until curated. They are still guessable in autocomplete.
5. **Daily snapshot:** at puzzle generation, freeze all data the puzzle needs (answer, displayed text, stats, image refs) into the `DailyPuzzle` row. A mid-day patch must never change or break today's puzzle.

## Daily puzzle engine

- One puzzle per mode per day. Reset at 00:00 **Europe/Zurich** (make this configurable).
- Deterministic selection: seeded RNG from `(date, mode, salt)`. Pre-generate puzzles 7 days ahead via cron. The admin page can override any day's puzzle.
- No-repeat window per mode: the answer can't repeat within N days (N = min(60, poolSize × 0.6)). Build Path uses a smaller window because its pool is small.
- Each mode defines its own eligibility filter. Examples: Lore requires reviewed lore text. Upgrade Guesser requires all three upgrade tiers.
- Store: `DailyPuzzle { date, mode, answerId, payload (JSON snapshot), dataVersion }`.
- Archive: past puzzles are replayable, but replays don't count toward stats or streaks.

## Redaction & rewriting (Lore, Ability Description, Upgrade Guesser)

- **Automatic pass:** replace hero names, ability names, item names, known aliases, place/faction names and pronoun-revealing unique terms with `▇▇▇` or a neutral placeholder (`[this hero]`, `[this ability]`).
- **Render templates:** the API text contains variables like `{s:…}` and formatting tags. Resolve them to real values and units, and strip markup.
- **Manual review:** anything auto-redacted is `needsReview` until approved or rewritten in the admin page. Store the final text separately from the source. The admin page shows source and final text side by side.
- If the source text changes after a patch, flag the stored rewrite as stale.

## Modes

Shared rules unless stated otherwise:
- Guesses go through an autocomplete input with icons. The search is fuzzy and accent-insensitive.
- Already-guessed entries are disabled.
- Unlimited guesses, no game over (except where noted).
- Hints unlock after a set number of wrong guesses.
- Wins produce a spoiler-free share string (emoji grid + guess count + mode + date).

### Hero modes

**1. Classic (attribute Wordle)**
The player guesses heroes, and each guess shows a row of attribute tiles compared to the answer.
- Green = match, orange = partial (multi-value overlap), red = no match, ↑/↓ for numeric.
- Columns: Gender · Species · Complexity · Weapon type · Base health (↑↓) · Bullet damage or DPS (↑↓) · Release date (↑↓).
- Every column must come from the API or the curation table. No guessed values.
- Keep the column definitions in one config file so columns are easy to change.

**2. Splash (hero picture)**
- Show the hero portrait/render, heavily zoomed on a random, seeded crop area.
- Each wrong guess zooms out one step.
- Optional hard toggle: grayscale.

**3. Ability Icon**
- Show an ability icon covered by tiles. Each wrong guess removes one tile.
- The player guesses the hero.
- Bonus round after winning: pick the ability name from 4 options.

**4. Lore**
- Show the redacted/rewritten lore in chunks. The first chunk is visible, and each wrong guess reveals the next one.
- Hints after 4 and 7 wrong guesses: gender, then species.
- Eligible only for heroes with reviewed lore.

**5. Ability Description**
- Show the redacted, rendered ability description. The player guesses the hero.
- Hints: after 3 wrong guesses, show the slot (1–4 / ultimate). After 6, show the blurred ability icon.
- Bonus round: name the ability.

**6. Whose Build?**
- Source: per-hero item analytics from the API, over a recent window and a mid-to-high rank filter.
- Pick the hero's most **distinctive** items: rank by lift (hero pick rate ÷ average pick rate across all heroes), not raw popularity. Generic items everyone buys make bad clues.
- Take the top 8 items and reveal them one by one, least distinctive first. The first clue is visible, and each wrong guess adds one more item.
- Freeze the item list in the daily snapshot.
- If analytics are unavailable at generation time, skip this mode for the day and show "Back tomorrow".

**7. Upgrade Guesser**
- Show an ability's upgrade texts, redacted and rendered: T3 first. Each wrong guess reveals T2, then T1, then the blurred ability icon.
- The player guesses the **ability**. The autocomplete lists abilities, grouped by hero.
- After winning, reveal the hero automatically.
- Eligible only for abilities with all 3 upgrade tiers.

### Item modes

**8. Item Picture**
- Show the item icon, blurred. Each wrong guess sharpens it.
- Hard toggle: grayscale + random rotation.

**9. Item Classic (attribute Wordle)**
- Columns: Slot (weapon/vitality/spirit) · Tier (↑↓) · Active/Passive · Has component (y/n) · Builds into another item (y/n) · Cooldown (↑↓ or "none") · Number of stat bonuses (↑↓).
- Don't include cost: it's identical within a tier, so it duplicates Tier.

**10. Build Path (easy mode)**
- Show one side of a component relationship; the player guesses the other side.
- Directions alternate daily: "What does this build into?" (show component) or "What's the component?" (show upgraded item).
- If the shown component builds into multiple items, accept any valid answer, and show all valid answers after the win.
- Easier than the other modes: 6 tries, a slot-color hint shown from the start, and item icons inside the autocomplete.
- Small pool, so use the short no-repeat window.

**11. Stat Bonus Guesser**
- Show the item name and icon plus all its stat bonuses, with one bonus value hidden (e.g. "+??% Fire Rate").
- The player guesses the number, and each guess shows ↑/↓.
- Win condition: exact match, or within a tolerance (±10% of the value, min 1 unit), in which case show the exact value.
- 5 tries. This is the only mode with a loss state.
- Only pick stats with clean numeric values. Skip conditional or scaling stats unless they render cleanly.

## UX & UI

- Home page: grid of all 11 modes, grouped Hero / Item, each with its solved state for today.
- Countdown to the next puzzle.
- "Yesterday's answer" shown per mode.
- Stats per mode: games played, win %, streak, guess distribution.
- Responsive and mobile-first; dark theme that fits Deadlock's art-deco/occult aesthetic.
- Keyboard: Enter submits, ↑/↓ navigates autocomplete.
- Footer disclaimer: "Fan-made, not affiliated with or endorsed by Valve. Deadlock and all related assets © Valve Corporation."

## Admin page (password-protected)

- Sync status: last sync, data version, diff since previous sync.
- Review queue (`needsReview`): new heroes, changed stats, stale rewrites.
- Curation editor for hero attributes, lore/description rewrites, and mode exclusions.
- Puzzle calendar: preview and override the next 7 days per mode.

## Milestones

1. Data layer: API exploration, types/Zod, sync job, DB schema, image mirroring
2. Daily engine + snapshots + archive
3. Shared UI (autocomplete, share, stats) + Classic + Item Classic
4. Picture modes (Splash, Ability Icon, Item Picture)
5. Text modes + redaction pipeline + admin review (Lore, Ability Description, Upgrade Guesser)
6. Build Path, Stat Bonus Guesser, Whose Build?
7. Polish, deploy, monitoring (alert when sync fails or a day has no puzzle)

## Quality requirements

- Unit tests: seeded selection (same date → same puzzle), no-repeat window, redaction (no answer name leaks), template rendering, Wordle comparison logic.
- A validation script that checks every scheduled puzzle for leaks: the answer's name or aliases must not appear anywhere in the displayed payload.
- Never crash on missing or renamed API fields: validate, log, and exclude that entity.
- Ask before guessing when API data is ambiguous. Don't invent game values.
