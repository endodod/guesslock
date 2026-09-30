# The Omens — Step 0 data spike

Date: 2026-09-30. Source: `api.deadlock-api.com` (OpenAPI 0.1.0), 10 ranked matches played the same day.

| Bucket | Match IDs | Player ranks (`initial_display_rank`) |
|---|---|---|
| High (`min_average_badge=100`) | 109041634, 109038953, 109036432, 109036220, 109035642 | 95–113 |
| Mid (`min_average_badge=50&max_average_badge=66`) | 109040201, 109038555, 109038381, 109037858, 109037528 | 45–65 |

All 10 were `game_mode=1` (Normal), `match_mode=4` (Ranked), `bot_difficulty=0`, scored, not low-priority and not new-player pool.

## Verdict

Most of the prompt holds, but **six assumptions are wrong or unverified** (marked ⚠ below). Per §2, I stopped before building. The decisions needed from review are listed at the end.

---

## 1. Response format

- `GET /v1/matches/{match_id}/metadata` returns **JSON** (≈0.9–1.1 MB per match). A protobuf variant exists at `/metadata/raw`, but it isn't needed.
- Top-level keys: `match_info`, `hero_build_ids`, `pregame_hero_ids`, `banned_hero_ids`. Everything in §3 of the prompt lives under `match_info`.
- Metadata was available about 10 minutes after the match ended.
- Rate limits: from cache 100 req/s per IP; from S3 100 req/10 s per IP; Steam fallback 3 req/h per IP. Pass `disable_steam=true` so a miss never burns the Steam budget.
- Bulk: `GET /v1/matches/metadata` (filters: badge range, `game_mode`, `is_low_pri_pool`, `is_new_player_pool`, timestamps, `account_ids`, …; `include_*` switches for paths/items/stats/death details). Limit: 30 req/min per IP.

## 2. `match_paths`

- `interval_s = 1.0`. The path index is the game second: deaths line up at offset 0 and health reaches 0 at +1 s. This held even in matches with pauses, so paths are in game time, not wall-clock time.
- `x_resolution = y_resolution = 16383`. **The bounds are per player** (`paths[i].x_min/x_max/y_min/y_max`), not per match:
  `world_x = x_min + x_pos / x_resolution × (x_max − x_min)` (the same for y).
  Checked against `death_pos` for every death in three matches: median error 55–73 world units, p90 178–267, on a map about 21,500 units wide.
- **⚠ `health` is a percentage (0–100)**, not absolute HP. Absolute max HP only appears in the coarse `stats[].max_health` (see 3).
- `combat_type` (proto enum `ECombatType`): 0 Out, 1 Player, 2 EnemyNPC, 3 Neutral. Across 10 matches: 63% out of combat, 21% fighting players, 8% NPCs, 7% neutrals. "In combat with players" (= 1) is directly usable for Clash negative candidates.
- `move_type` (`EMoveType`): 0 Normal, 1 Ability, 2 AbilityDebuff, 3 GroundDash, 4 Slide, 5 RopeClimbing, 6 Ziplining, 7 InAir, 8 AirDash.
- Path arrays are 0–100 samples longer than `duration_s` (a tail after the match ends). **2 of 10 matches had a player whose path ends early** (1658 of 1937 s; 2023 of 2034 s). The "complete paths for all 12 players" filter catches this.

## 3. `stats` intervals

- **⚠ Samples are coarse:** `time_stamp_s` = 180, 360, 540, 720, 900, then every 300 s (1200, 1500, 1800), plus one at match end. That's 7–9 samples per match.
- `net_worth`, `level`, `boss_damage`, `max_health`, K/D/A and gold sources are all populated, but only at those timestamps.
- Consequences:
  - Net worth and level at an arbitrary T must be **interpolated** between samples. Current items can be exact (see 5b), and the inventory's shop value is exact at T. Proposal: show "net worth ≈" from interpolation, or show exact inventory value instead.
  - **"`boss_damage` rising" can't serve as a per-moment Beast signal** (the prompt's §5 preference). Use hero proximity to the midboss plus `combat_type = 3` (Neutral, which covers the midboss) instead.

## 4. `mid_boss`

- 1–2 entries per match (in 10 matches: four had 1, six had 2; 16 kills in total).
- **Rejuv steals do occur:** `team_killed ≠ team_claimed` in 2 of 16 kills (109041634 at 1498 s, 109037528 at 1793 s). The Beast's "which team gets the rejuv" question is meaningful.
- Kill times: first kill 971–1555 s; second kill 425–525 s after the first.
- **⚠ Spawn/respawn rules aren't in the API.** `generic-data.rejuv_params` gives the rejuv buff duration (180 s) and `rejuvinator_rebirth_duration` (180 s per tier), but not the midboss's first spawn time or respawn timer. Beast *negative* candidates need "midboss alive" windows, so this rule must come from game knowledge (to confirm), or be approximated as "no kill yet, or ≥ 420 s since the last kill".
- **⚠ The midboss position isn't in `/v1/assets/map`.** It can be derived from hero positions at kill times (they cluster tightly), or hard-coded once.

## 5. `objectives`

- 19 entries per match. `team_objective_id` follows proto `ECitadelTeamObjective`: 0 Core, 1–4 Tier1 lanes 1–4, 5–8 Tier2 lanes 1–4, 9 Titan, 10–11 Titan shield generators, 12–15 barrack bosses (base guardians) lanes 1–4. Lane 2 isn't used on the current 3-lane map: the ids seen are 0, 1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15 (no 2, 6 or 13).
- `destroyed_time_s = 0` means **not destroyed**. It's reliable otherwise: in 109041634 the losing core falls at 1810 s against `duration_s` 1811. `first_damage_time_s` also exists.
- `objectives_mask_team0/1` give the end state as a bitmask.

### 5b. Items (for §3 "items owned at T")

- `players[].items[]` mixes shop items and **ability upgrade events** (item `type = ability` in `/v1/assets/items`). Filter to `type = upgrade` for the inventory. The ability events give ability ranks at T for free.
- Owned at T: `game_time_s ≤ T && (sold_time_s == 0 || sold_time_s > T)`. When an item upgrades into its successor, `sold_time_s` equals the successor's purchase time (`flags = 1`). Example: Headshot Booster sold at 598, Headhunter bought at 598. So the rule needs no special case.
- `imbued_ability_id` is set for imbue items.

## 6. Team mapping (Amber / Sapphire) ⚠ not fully verified

- Metadata uses lobby teams `0` / `1` (`ECitadelLobbyTeam_Team0/Team1`).
- Team 0 spawns at world y ≈ −10,100 (the bottom of the minimap), and `map.objective_positions.team0_core` sits at `top_relative 0.92`. Team 1 spawns at y ≈ +10,300 (the top).
- The game's own colours: `colors.team1_color` = rgb(212,134,11), amber; `team2_color` = rgb(77,117,195), sapphire. These use the in-game team numbering (2/3), not the lobby's 0/1.
- **Likely mapping: lobby team 0 = Amber (Hidden King), team 1 = Sapphire (Archmother).** Nothing in the metadata, the assets or the protobufs states it explicitly. Before shipping, confirm once against a real replay or a screenshot: "the bottom base in the minimap is Amber".

## 7. Map image and calibration

- `assets.deadlock-api.com` isn't reachable from this environment (the gateway returns 502), but everything needed is available elsewhere:
  - `GET /v1/assets/map` returns `radius = 10752`, image URLs on `assets-bucket.deadlock-api.com` (reachable; `minimap_midtown_mid.png` is 1024×1024 RGBA; also `frame`, `mid_tunnels` and `rat_tunnels` layers), relative objective positions, zipline splines and 51 neutral camps.
- **Calibration is exact:**
  `left = (x + R) / 2R`, `top = (R − y) / 2R`, R = 10752 (multiply by the image size for pixels).
  Verified against all 51 neutral camps, which carry both world and relative coordinates: max error 0.0.
- The objective icons can be placed from `objective_positions` directly.

## 8. Match lists

| Need | Endpoint | Notes | Rate limit (per IP) |
|---|---|---|---|
| (a) Top players | `GET /v1/leaderboard/{region}` (Europe, NAmerica, …) | ⚠ Entries have `account_name`, `rank`, `top_hero_ids` and **`possible_account_ids` (up to ~8 candidates), not a single account ID**. Updated hourly. | 100 req/s |
| (b) A player's history | `GET /v1/players/{account_id}/match-history` | 1613 matches returned for one account. The newest match (≈15 min old) wasn't in it yet, which confirms the prompt's "recent matches can lag" note. | 100 req/s from storage; Steam refetch 10 req/h (bot-friends only) |
| (c) Matches by rank | `GET /v1/matches/metadata?min_average_badge=…&max_average_badge=…` | The filter works server-side, but ⚠ **the response's `average_badge_team0/1` is always 0**. Use the per-player `player_rank_data.initial_display_rank` (tier×10 + subtier) for `rankBucket`. | 30 req/min |

`/v1/sql` is deprecated; the public data lake at `data.deadlock-api.com` is the suggested bulk alternative for nightly generation.

## 9. Other observations

- **Pauses are common:** 8 of 10 matches have `match_pauses` (entries of `{game_time_s, pause_duration_s, player_slot}`, often a 0-duration request paired with the real pause). Paths stay aligned to game time, so "skip windows containing a pause" only drops a few windows. It's still worth keeping, since the fight state freezes.
- **Candidate density looks healthy.** "≥2 deaths within 15 s" (after 3:00) gives 7–22 Clash clusters per match (median ≈ 16), and there are 1–2 midboss kills per match. A day's high-rank pool easily supplies daily picks.
- 3 of 10 matches have one player with no `player_rank_data`. Use the median of the players that have it.

---

## Decisions needed before building

1. **Net worth / level at T:** interpolate between 180/300 s samples (shown as "≈"), or show exact inventory value instead of net worth?
2. **Beast signals:** replace "`boss_damage` rising" with proximity to the midboss plus `combat_type = Neutral`. OK?
3. **Midboss alive windows:** please confirm the first-spawn time and the respawn timer, or approve the approximation "no kill in the last 420 s" for negative candidates.
4. **Team colours:** confirm team 0 = Amber (bottom base) once, e.g. from a replay or screenshot.
5. **Top-players source:** resolve leaderboard `possible_account_ids` by intersecting them with match participants, or use "high average badge" matches (≥ 100) as the top-player pool?
6. **HP display:** percent only (paths are percent; absolute max HP is only in coarse stats). OK to show HP rings as percent?
