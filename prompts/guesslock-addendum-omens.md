# Addendum Prompt: GUESSLOCK — The Omens (Game State Prediction)

> Extends `guesslock-build-prompt.md`, `guesslock-design-prompt.md` and `guesslock-addendum-emoji-quote.md`. Everything in those still applies. This file adds a third row of locks, **The Omens**. The player sees a frozen moment from a real match and predicts what happens next. Where this file conflicts with the others, this file wins.

## 1. Summary

- New row **The Omens**:
  - **XIV — The Clash** (teamfight)
  - **XV — The Beast** (midboss)
  - **XVI — The Rift** (Unstable Rift, phase 2)
- A **daily scenario** per Omen (same for everyone) plus an endless **Practice mode** using the player's own matches, top players' matches or random matches.
- Built in two phases:
  - **Phase 1:** The Clash + The Beast, using match metadata from deadlock-api only.
  - **Phase 2:** a replay-parsing worker that adds The Rift and ultimate cooldowns.

## 2. Step 0 — Data spike (do this first, report before building)

Before writing any feature code, fetch **5 real matches** from high ranks and 5 from mid ranks via deadlock-api's match metadata endpoint (find the exact path in the OpenAPI spec; expected: `/v1/matches/{match_id}/metadata`). Report back on:

1. **Response format:** JSON or raw protobuf. If protobuf, decode it with Valve's definitions (`CMsgMatchMetaDataContents`, SteamDatabase/Protobufs, `deadlock/citadel_gcmessages_common.proto`).
2. **`match_paths`:**
   - The value of `interval_s`.
   - How `x_pos`/`y_pos` map to world coordinates, using `x_min/x_max/y_min/y_max` and `x_resolution/y_resolution`.
   - The scale of `health` (absolute value or percentage?).
   - How `combat_type` and `move_type` look in practice.
3. **`stats` intervals:** the spacing of `time_stamp_s`, and whether `net_worth`, `level` and `boss_damage` are populated.
4. **`mid_boss`:** the number of entries per match, and whether `team_killed` ≠ `team_claimed` shows up (rejuv steals).
5. **`objectives`:** which `team_objective_id` values appear and whether `destroyed_time_s` is reliable.
6. **Team mapping:** which lobby team is Amber (Hidden King) and which is Sapphire (Archmother). Verify it; don't assume.
7. **Map image:** whether the assets API provides a minimap image. If it does, calibrate world coordinates → image pixels using known positions (objective locations, death positions). If it doesn't, find an alternative source and calibrate the same way.
8. **Match lists:** the endpoints for (a) leaderboard / top players, (b) a player's match history by account ID, (c) matches by rank. Report their rate limits.

Write the findings to `docs/omens-data-spike.md`. **Stop and wait for review** if any assumption in this prompt turns out wrong.

## 3. Data available (Phase 1, metadata only)

From Valve's match metadata:

| Need | Source field |
|---|---|
| Hero positions, HP, in-combat state | `match_paths.paths[]`: `x_pos`, `y_pos`, `health`, `combat_type`, `move_type` per `interval_s` |
| Deaths | `players[].death_details[]`: `game_time_s`, `killer_player_slot`, `death_pos`, `killer_pos`, `death_duration_s` |
| Items owned at time T | `players[].items[]`: `game_time_s` (bought), `sold_time_s`, `upgrade_id` |
| Net worth, level, K/D/A over time | `players[].stats[]` at `time_stamp_s` |
| Map state | `objectives[]`: `team_objective_id`, `team`, `destroyed_time_s` |
| Midboss + rejuvs | `mid_boss[]`: `team_killed`, `team_claimed`, `destroyed_time_s` |
| Match quality filters | `game_mode`, `match_mode`, `not_scored`, `low_pri_pool`, `new_player_pool`, `abandon_match_time_s`, `match_pauses`, `average_badge_team0/1` |

**Not available in Phase 1:** Rift events, ability and ultimate cooldowns. The UI must not pretend to show them.

## 4. Scenario model

A **scenario** is a moment `T` in a match plus an answer window `W` after it.

Store: `Scenario { id, omen, matchId, T, W, snapshot (JSON), windowEvents (JSON), answers (JSON), source (daily|practice), rankBucket, patchVersion, quality, status }`

**Snapshot at T** (everything the player sees):
- Game time.
- Per hero:
  - Team, hero ID and position (+ a short **5s trail** so movement direction is readable).
  - HP (bar) and alive/dead state, with a respawn countdown for dead heroes.
  - Level, net worth and current items (bought ≤ T and not sold ≤ T).
- Team net worth totals and the difference.
- Objectives alive/destroyed.
- Midboss status (alive / killed at time X).
- Rejuvs claimed so far per team.
- **Never included:** player names, account IDs, match ID, final score, winner, or any event after T.

**Window events T → T+W:** deaths (who, when, where, killer), midboss kill/claim, objectives destroyed. Store them as a compact timeline for the reveal animation. Store hero paths at full resolution for the window.

**Answers:** derived from the window events (§6). Computed once at generation and stored.

## 5. Moment detection

### Match filters (all Omens)
- Keep only normal game mode, scored matches, not low-priority, not new-player pool, no abandons, and no bots.
- Skip any window containing a pause.
- Require complete path data for all 12 players across `[T−10s, T+W]`.
- Only use matches from the current patch (for daily scenarios); practice can include older patches with a label.

### The Clash (W = 30s)
- **Positive candidates:** death clusters, meaning ≥2 hero deaths within 15s of each other, involving heroes from both teams within fight range.
  - `T` = first death time − a random lead of 10–20s. Seed the randomness per scenario so it's reproducible.
- **Negative candidates (nothing happens):** moments where at least 3 heroes per team are within fight range, and/or `combat_type` shows player combat, but **no death happens in [T, T+W]**.
- **Mix:** daily and practice pools target roughly **60% positive / 40% negative**. Otherwise "someone dies" is always right.
- Skip the first 3 minutes of the game.

### The Beast (W = 60s)
- **Positive candidates:** each `mid_boss[]` kill. `T` = `destroyed_time_s` − a random lead of 30–50s.
  - Prefer moments where `boss_damage` in the `stats` intervals shows the attempt already started, or heroes are converging on the midboss.
- **Negative candidates:** moments where the midboss is alive (derive alive windows from the spawn/respawn rules and kill times; verify the rules in the data spike), a team is near the midboss or `boss_damage` is rising, but **no kill in [T, T+W]**.
- Same ~60/40 mix.

### Quality score
Rank candidates by how readable they are:
- At least 6 heroes on screen near the action
- No heroes mid-respawn-timer with less than 3s left
- The net worth gap isn't extreme (stomps are boring)

Daily picks come from the top-quality bucket only.

## 6. Questions & scoring

The player answers **all questions at once**, then locks in. Each Omen is worth **max 100 souls**.

### The Clash
| Question | Input | Points |
|---|---|---|
| Does anyone die in the next 30s? | Yes / No | 20 |
| Deaths per team (Amber / Sapphire) | Two steppers, 0–6 | 15 each: exact = 15, off by 1 = 7, else 0 |
| Who dies? | Multi-select hero icons on the map (or none) | 50: +50/n per correct pick, −50/n per wrong pick (n = actual deaths, min 1), floor 0 |

If "No" is answered, the steppers default to 0 and hero selection is disabled, but the player can switch back.

### The Beast
| Question | Input | Points |
|---|---|---|
| Is the midboss killed in the next 60s? | Yes / No | 30 |
| Which team kills it? | Amber / Sapphire | 20 |
| Which team gets the rejuv? (steal?) | Amber / Sapphire | 25 |
| Rejuvs per team after the window | Two steppers | 25: both exact = 25, one exact = 12 |

If "No" is answered, the team questions are disabled, and the rejuv steppers stay at the current counts (the correct answer if nothing happens).

### The Rift (Phase 2)
| Question | Input | Points |
|---|---|---|
| Which team claims the rift? | Amber / Sapphire / Nobody (expires) | 50 |
| Deaths at the rift per team | Two steppers | 25 each, same as The Clash |

### Box state & share
- **Box state in the Vault:** "Opened" with the score. There is no win/loss for Omens.
- **Share symbol:** ✨ ≥ 80 souls · 🔓 ≥ 40 · 🔒 < 40.
- **Per-Omen share line:** one ✓/✗ per question, e.g. `GUESSLOCK #142 — The Clash` / `✓✓✗✓ · 72 souls`.

## 7. Daily Omens

- Generate candidates nightly from recent high-rank matches (top leaderboard players + a high average-badge filter).
- **Admin approval:** the admin page shows the next 7 days of candidates per Omen. Each has a preview of the snapshot and the reveal animation, and buttons to approve / reject / regenerate. An unapproved day falls back to the top-quality candidate automatically.
- The same snapshot for everyone, frozen in `DailyPuzzle.payload` like all other modes.
- After the reveal, show the hero names and a "View full match" link to an external replay viewer using the match ID. The match ID is revealed only at that point.

## 8. Practice mode (`/omens/practice`)

Endless, and it doesn't count toward the Soul Tally, streaks or daily stats. It has its own stats in the Ledger ("Practice accuracy per Omen").

**Sources (tabs):**
1. **My matches:**
   - The player enters a Steam profile URL, Steam ID or account ID (optionally via Steam login later).
   - Fetch their match history, then generate scenarios on demand from the last 20 matches, with caching.
   - Show a note: recent matches can take 1–2 days to show up, and some are never indexed. Link to deadlock-api's ingest tool, which submits your own matches automatically.
   - In this tab, the player's own hero is highlighted and the questions can be answered from their perspective. Names stay hidden until the reveal.
2. **Top players:** scenarios from leaderboard players' recent matches.
3. **Random:** filters for rank range and patch.

**Generation cost:** cache fetched metadata and generated scenarios in Postgres. Rate-limit per user. Pre-generate a pool of top-player and random scenarios nightly, so those tabs are instant.

## 9. UI (follows the Guesslock design system)

### Vault
- A third row, **The Omens**, below the Curiosity Shop: 3 boxes (XIV–XVI).
- The Rift shows **"Sealed — coming soon"** (wax seal state) until Phase 2 ships.
- The progress line counts Omens as opened once locked in: "x / 15 locks open" (16 when The Rift ships).
- The Omen boxes have a distinct inner glow (`--cursed` tint) so the row reads as a different kind of puzzle.

### Omen screen
- **Header:** as in other locks, plus the game time at `T` in large Plex Mono ("23:41").
- **Map (the main stage):**
  - SVG over the calibrated minimap image, inside a deco frame.
  - Hero icons are circles in team colors (Amber / Sapphire) with an HP ring and a fading 5s trail.
  - Dead heroes sit greyed at their team's base with a respawn countdown.
  - Objectives are shown as icons (alive = solid, destroyed = outlined). The midboss has its own icon and status.
  - Controls: pinch/scroll zoom and pan, and a "focus on action" button that zooms to the fight area.
- **Team panels** (left and right on desktop, tabs on mobile):
  - Per hero: portrait, level, net worth and item icons (compact row, tap to expand with tooltips).
  - Team net worth total, rejuvs held, and a rejuv buff indicator if active.
  - Hovering a hero in the panel highlights it on the map, and vice versa.
- **Prediction panel:**
  - Desktop: below the map. Mobile: a bottom sheet.
  - The questions from §6, then the **"Lock in"** button (brass, with a keyhole). Confirm before locking. Answers can't be changed after.
- **Honesty note** (small, ash text): "Ability cooldowns are not shown." Hide the note in Phase 2 once cooldowns are available.

### Reveal
1. After lock-in, the map **plays the window** at 2× speed: heroes move along their real paths and HP rings update.
   - Deaths pop with a `--velvet` ring and skull marker; midboss kill/claim events flash with a team-colored ring.
   - Timeline scrubber below the map with event markers; play/pause and 1×/2×/4× controls.
2. Then the **results panel:** each question with the player's answer vs. the real answer, points per question, the total in souls, and the share button.
3. Hero names and the "View full match" link appear here.
4. With reduced motion, show the final state directly with an event list instead of the animation.

## 10. Phase 2 — Replay worker (The Rift + cooldowns)

- A separate **Python worker** using the **boon** demo parser (`boon-deadlock` on PyPI), fed by a job queue in Postgres.
- The worker resolves the replay download from the match salts (check deadlock-api's salts endpoint), downloads and parses the replay, and extracts:
  - `rift`: lifecycle, capture/expiry, winner, lane and position
  - `ability_ticks`: cooldown and charge state, to show ultimate readiness per hero at `T`
  - `mid_boss`: rejuv pickup/use/expire, to cross-check Phase 1 data
- Store the results in `ScenarioEnrichment { matchId, riftEvents, cooldownsAtT }`, linked to scenarios.
- **Budget:** only parse matches that are daily candidates or in the pre-generated practice pools. Never parse on demand from a user request.
- **Replay retention on Valve's servers is unknown.** Measure it during the Phase 2 spike, and parse candidates soon after the match.
- **The Rift detection:** positive = rift spawned and claimed, `T` = rift open time − 15–25s. Negative = the rift expires unclaimed. Nobody claiming is a valid answer, so no artificial mix is needed.
- Cooldowns in the UI: a small ult icon on each hero (ready = bright, on cooldown = dim + seconds remaining). Remove the honesty note once live.

## 11. Admin additions

- Omen candidate calendar with preview, approve/reject/regenerate (§7).
- Detection tuning: lead times, window lengths, positive/negative ratio and quality thresholds, as config values editable in the admin page.
- Scenario inspector: open any scenario, scrub the full `[T−10s, T+W]` range, and view the raw events.
- Phase 2: worker queue status, failed parses, replay availability stats.

## 12. Tests

- **Item reconstruction:** inventories at T match purchases/sales. Test against 3 hand-checked matches.
- **Answer derivation:** deaths per team, who died, midboss killer/claimer and rejuv counts are correct for known fixtures.
- **No leaks:**
  - The snapshot payload contains no names, account IDs, match ID, or events after T.
  - The client never receives window events before lock-in. The reveal data is fetched only after the answers are submitted.
- **Scoring:** edge cases (no deaths, a player selects none, all wrong, steppers at 0).
- **Detection:** the positive/negative ratio holds within ±10% over a generated pool of 200 scenarios.
- **Coordinate calibration:** known objective positions land on the correct map icons within a small pixel tolerance.
