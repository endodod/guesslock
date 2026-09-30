# The Resonance — Step 0 data spike

Date: 2026-09-30. Source: `GET https://api.deadlock-api.com/v1/assets/sounds` (16.5 MB JSON) and the 38 active heroes
from `/v1/assets/heroes?only_active=true`. Matching and loudness code: `src/lib/sounds/` (the same code the import uses).

## Verdict

**Usable.** Every active hero has an ability folder, and every active hero has at least one ability that the automatic
pass can already fill with a cast clip plus a second clip (before review). The spec's assumptions hold, with the
corrections marked ⚠ below. I continued with the build; the decisions I made are listed at the end.

---

## 1. Shape of `/v1/assets/sounds`

Unchanged from the spec (§2). A nested folder tree; leaf keys are file names **without** extension, leaf values are CDN
URLs (`https://assets-bucket.deadlock-api.com/assets-api-res/sounds/abilities/haze/haze_sleep_dagger_cast.mp3`).

| Folder | Subfolders | Files | Use |
|---|---|---|---|
| `abilities` | 51 | 2,770 | main clue |
| `weapons` | 45 | 2,778 | gun hint |
| `vo` | 62 | 105,477 | not used |
| `player`, `ui`, `npc`, `mods`, `ambience`, … | | ~7,700 | not used |

Formats: 118,318 `.mp3`, 14 `.wav` (none in hero folders we use; the import only takes `.mp3`).
The CDN (Cloudflare) sends `ETag` (content MD5) and `Last-Modified`, so a cheap `HEAD` detects changed clips.

## 2. Codename → hero

Resolver (`resolveHeroFolders`): a folder belongs to a hero when it equals the codename (`class_name` without `hero_`,
"exact"), the squashed display name (`Mo & Krill` → `mokrill`) or a single name word of 4+ letters (`Lady Geist` →
`geist`) ("alias"). Exact matches win; a folder never goes to two heroes. `shared` is ignored.

⚠ **A hero can have several folders.** Lady Geist has `ghost` (new `a1_…/a4_…` layout) **and** `geist` (older flat
files); Pocket has `synth` **and** `pocket`. `HeroSoundMap` therefore stores folder **lists** (`abilityFolders[]`,
`weaponFolders[]`), not one folder each.

| Hero | class_name | Ability folders | Weapon folders |
|---|---|---|---|
| Abrams | hero_atlas | `abrams` (alias) | `abrams` (alias) |
| Apollo | hero_fencer | `fencer` | `fencer` |
| Bebop | hero_bebop | `bebop` | `bebop` |
| Billy | hero_punkgoat | `punkgoat` | `punkgoat` |
| Calico | hero_nano | `nano` | `nano` |
| Celeste | hero_unicorn | `unicorn` | `unicorn` |
| Drifter | hero_drifter | `drifter` | `drifter` |
| Dynamo | hero_dynamo | `dynamo` | `dynamo` |
| Graves | hero_necro | `necro` | `necro` |
| Grey Talon | hero_orion | `orion` | `orion` |
| Haze | hero_haze | `haze` | `haze` |
| Holliday | hero_astro | `astro` | `astro` |
| Infernus | hero_inferno | `inferno` | `inferno` |
| Ivy | hero_tengu | `tengu` | `tengu` |
| Kelvin | hero_kelvin | `kelvin` | `kelvin` |
| Lady Geist | hero_ghost | `ghost`, `geist` (alias) | `geist` (alias) |
| Lash | hero_lash | `lash` | `lash` |
| McGinnis | hero_forge | `forge` | `forge` |
| Mina | hero_vampirebat | `vampirebat` | `vampirebat` |
| Mirage | hero_mirage | `mirage` | `mirage` |
| Mo & Krill | hero_krill | `mokrill` (alias) | `krill` |
| Paige | hero_bookworm | `bookworm` | `bookworm` |
| Paradox | hero_chrono | `chrono` | `chrono` |
| Pocket | hero_synth | `synth`, `pocket` (alias) | `pocket` (alias) |
| Rem | hero_familiar | `familiar` | `familiar` |
| Seven | hero_gigawatt | `gigawatt` | `gigawatt` |
| Shiv | hero_shiv | `shiv` | `shiv` |
| Silver | hero_werewolf | `werewolf` | `werewolf` |
| Sinclair | hero_magician | `magician` | `sinclair` (alias) |
| The Doorman | hero_doorman | `doorman` | `doorman` |
| Venator | hero_priest | `priest` | `priest` |
| Victor | hero_frank | `frank` | `frank` |
| Vindicta | hero_hornet | `hornet` | `hornet` |
| Viscous | hero_viscous | `viscous` | `viscous` |
| Vyper | hero_viper | `viper` | `viper` |
| Warden | hero_warden | `warden` | `warden` |
| Wraith | hero_wraith | `wraith` | `wraith` |
| Yamato | hero_yamato | `yamato` | `yamato` |

All 38 resolved automatically; no manual entry needed today (the admin page can still edit every mapping).

Unclaimed (never used): abilities `archer, architect, cadence, fathom, kali, operative, sentry, tokamak, trapper,
wrecker`; weapons `cadence, digger, kali, operative, tokamak, wrecker`. ⚠ `digger` is Mo & Krill's old codename
(`digger_scorn_cast` sits in `abilities/mokrill`, `weapons/krill/fire/digger_weapon_fire_*`), but `weapons/digger` only
holds generic reload sounds, so it stays unmapped on purpose.

## 3. Automatic clip → ability matching

Scoring (`scoreClip`): the larger share of class-name tokens (`citadel_ability_bull_charge` → `bull`, `charge`) or
display-name tokens (`Shoulder Charge` → `shoulder`, `charge`) found in the clip path (exact token, or inside a compound
like `siphonlife`), +0.25 for the matching slot prefix `a1`…`a4`, −0.25 for another slot's prefix. Threshold 0.5; a tie
between two abilities leaves the clip unmatched. Role = the **last** role word in the name (`cast_lp` → loop,
`cast_05_impact` → impact). Whiz-bys (`whizby`, `whoosh`) and `_end`/`_expire` stingers are excluded by default.

Totals: 2,549 `.mp3` clips in the 44 mapped ability folders; 1,873 matched an ability, 266 excluded as whiz-by/stinger.
Abilities with a suggested cast clip and ≥ 2 clips, per hero (before review): 1–4 of 4; **38/38 heroes have at least one**.

Five heroes in detail (clip names relative to the hero folder; role; score):

**Abrams** (`abilities/abrams`)
- Siphon Life: `abrams_a1_siphonlife_cast` cast 1.25, `…_loop` loop, `…_end` (stinger, excluded)
- Shoulder Charge: 24 clips — `a2_charge/cast`, `abrams_a2_charge_cast_01` cast; `a2_charge/impact_01…03`, `…_hero_impact_*`, `…_trooper_impact_*`, `…_wall_impact` impact; `…step_*` other (all 0.75)
- **Infernal Resilience (passive): no clip**
- Seismic Impact: `a4_leap/abrams_a4_slam_cast` cast, `…slam_impact`, `impact_core`, `impact_explosion` impact, `…slam_float_lp` loop, `rise`/`descend` other
- Unmatched: `abrams_a4_slam_cast_01` (no ability token: "slam" appears in neither `bull_leap` nor "Seismic Impact")

**Mo & Krill** (`abilities/mokrill`) — everything matched
- Scorn: `a1_scorn/cast_dive|cast_flutter|cast_liquid` cast 1.25, `digger_scorn_cast` cast 1.0
- Burrow: 25 clips — `a2_burrow/mokrill_a2_burrow_cast` cast, `…_impact` impact, `spin_*_lp`/`travel_*_lp` loop, …
- Sand Blast: `a3_sandblast/cast_liquid|cast_snake|cast_tail` cast, `…sandblast_hit` impact
- Combo: `a4_combo/mokrill_a4_combo_cast_01` cast, `impacts_01…12` impact, `laser_lp`/`channel_*` loop; 12 `whoosh_*` excluded

**Holliday** (`abilities/astro`) — multi-part abilities
- Powder Keg (`a1_exp_barrels/…`): `holliday_a1_barrel_cast`, `launch` cast; `explode`, `…barrel_explode_0x`, `…hit_0x` impact; `fire_lp` loop (0.75: only `barrel` of `explosive_barrel` appears, plus the `a1` prefix)
- Bounce Pad: 30 clips — `activate`, `…launch_0x`, `…launch_basic_0x`, `…jump_pad_barrel_launch_0x` cast; `land`, `direct_hit` impact; `…mod_travel_lp` loop
- Crackshot: only `a3_target_practice/holliday_a3_crackshot_headshot_confirmation_*` and `…_ready` (other). ⚠ The actual cast (`a3_target_practice/cast`, `impact_lyr1/2`) is **unmatched** ("target practice" is an old name) — the admin assigns it.
- Spirit Lasso: `a4_lasso/cast`, `…lasso_cast`, `…lasso_throw` cast, `…lasso_impact` impact, `lp1`/`lp2`/`…captured_lp` loop

**Rem** (`abilities/familiar`) — class names are useless (`ability_familiar_ability02`), display names carry it
- Pillow Toss: `familiar_pillow_cast_01…03` cast, `…hit_*`, `…projectile_impact_*` impact (0.5: "toss" never appears)
- Tag Along: `familiar_tagalong_cast_01…03` cast, `…attach_host_*` other, `…travel_lp_01` loop
- Lil Helpers: `familiar_helping_hands_cast_01…03` cast, `…aura_impact_*` impact, many `_lp`
- Naptime: `familiar_naptime_cast_01` cast, `…aoe_explode_01` impact, `…channel_01` loop
- Unmatched: 35 `familiar_helper_emote_*` (Rem's helpers chattering; not an ability sound)

**Haze** (`abilities/haze`)
- Sleep Dagger: `haze_sleep_dagger_cast` cast, `…_hit` impact, `…_lp` loop; `a1_finesse_dagger/throw_1…4` cast (older name, matched via `dagger` + `a1`); 6 whiz-bys excluded
- Smoke Bomb: `haze_smoke_bomb_cast` cast, `a2_smoke_bomb/mod_start_lyr1…3` cast, `…_lp` loop, `…invis_0x` other
- **Fixation (passive): no clip** (as the spec predicted)
- Bullet Dance: `haze_bullet_flurry_cast_start|cast_delay` cast, `…cast_lp` loop, `…cast_end` excluded

Also checked: **Pocket** — `a2_grasp`, `a3_blitz`, `a4_cosmic_box` (16 clips of cut abilities) stay unmatched, correctly;
`a1_plasma_flux/pocket_a1_barrage_cast_*` lands on Barrage (the file name wins over the folder name, which is right).
**Lady Geist** — both folders map cleanly onto all four abilities.

Typical errors of the automatic pass: renamed abilities (Crackshot/"target practice", Seismic Impact/"slam"), and
passives with no sound. Wrong-ability matches were rare in the five heroes above; the unit test fixes a hand-labelled set
of cast clips for Haze, Abrams, Mo & Krill, Holliday and Lady Geist (precision 1.0 at the time of writing, required ≥ 0.9).

Weapon folders: fire family (`isWeaponFire`: `fire|shoot|shot|primaryweapon`, never reload/whiz-by/impact/dry) found
for every hero; Graves only has `necro_wpn_last_shot_01` (his gun is a tether, `necro_wpn_tether_*`), so an admin may
prefer a tether clip there.

## 4. Duration and loudness (30 clips)

30 matched, non-excluded clips spread over all heroes, decoded with WASM mpg123 (`mpg123-decoder`, no ffmpeg).
Loudness = RMS of the loudest 400 ms window (like EBU momentary loudness, no K-weighting): ability sounds are bursts
with long tails, so whole-clip RMS mostly measures silence.

| | min | median | max |
|---|---|---|---|
| Duration | 463 ms | 2,440 ms | 15,878 ms (a `_lp` loop) |
| File size | 12 KB | 72 KB | 515 KB |
| Peak | −8.9 dBFS | −0.1 dBFS | +1.3 dBFS (decoder overshoot) |
| Loudness | −29.7 dBFS | −11.7 dBFS | −5.6 dBFS |
| Crest (peak − loudness) | 6.9 dB | 11.2 dB | 23.8 dB |

None of the 30 was under 250 ms (short clicks exist, e.g. `…_select_01`, and are caught at measurement).

**Normalization target: −20 dBFS** (loudest 400 ms), gain capped so the peak stays ≤ −1 dBFS, gain range −24…+18 dB.
The source material is mastered hot (median −11.7), so almost every clip is turned **down**, which never clips. After
`gainDb`, **29/30 land exactly on −20**; the outlier (`vindicta_assassinate_scope_out`, a quiet click with a 24 dB crest)
is peak-limited to −24.8. `gainDb` is stored per clip and applied with a Web Audio `GainNode`.

## 5. Leaks

Yes: every URL and index path contains the codename twice (`…/abilities/haze/haze_sleep_dagger_cast.mp3`), and many
file names spell the ability (`abrams_a1_siphonlife_cast`). The mirroring plan removes that:

- Approved clips are downloaded into `MirroredAsset` and served only as `/media/<40 hex>`; the payload never stores the
  source URL, path or file name (only `SoundClip` rows in the admin do).
- ⚠ Plain `sha1(url)` (what images use) is not enough for sounds: the index is public, so anyone could hash all 118k
  URLs once and look an id up. Sound clips use **`sha1("sound:" + PUZZLE_SALT + ":" + url + "#" + etag)`** instead —
  still opaque, deterministic and 40 hex characters; the ETag gives changed upstream bytes a new asset while frozen
  puzzles keep the old one.
- Remaining, accepted: the audio bytes themselves are the upstream bytes, so someone who downloads every ability clip
  could match files by content. Re-encoding would need an MP3 encoder; not worth it for a daily fan game.
- Clip labels are neutral ("Sound 1", "Sound 2", "Gun"); roles and names only appear after the win (the ability name
  only after the bonus pick).

## Decisions and defaults (things the spec left open)

- **Folder lists** per hero (see §2). The daily sync auto-fills new heroes and flags heroes with no ability folder.
- **Import everything in mapped folders** (≈ 2.5k ability + 2.2k weapon clips): matched clips become `suggested`,
  everything else `excluded` with a reason (`unmatched`, `whiz-by`, `end stinger`, `too short`, `not a fire sound`), so
  the admin can still assign any clip by hand. Unmapped/unreleased folders are never imported.
- **Measurement** runs for `suggested` clips in the background within a time budget (resumable, like voice lines) and
  always on approval. Clips under 250 ms are then excluded (`too short`) unless an admin touched them.
- **Approval mirrors** the clip. Eligible ability = ≥ 1 approved `cast` + ≥ 2 approved clips, all mirrored.
- **Clip 1**: a starred ("prefer as clip 1") approved cast clip, else a seeded pick among approved casts.
  **Clip 2**: a seeded pick among the other approved clips, preferring impact, then loop, then other, then another cast.
- **Gun hint**: a starred approved weapon clip, else a seeded approved one. No approved weapon clip → the hint shows the
  weapon type as text instead (label "Weapon type").
- **Playback**: never autoplays; at most 8 s per play with a 0.3 s fade (loops run up to 16 s); low-pass 700 Hz, Q 0.7.
- **Volume**: "Sound locks volume" slider, default 80 %, separate from the SFX toggle.
- **Hard mode "Muffled only"** is client-side, like the other hard-mode settings: the server still unlocks the same
  clips at the same steps, the client simply keeps the filter on until the win (step 1 gives nothing new).
- **Skip sound locks**: The Resonance shows "Skipped" (not clickable) and drops out of the lock count, the "vault is
  open" check, the combined share and the streak.
- **Re-import**: admin decisions (status, role, ability, star) are kept (`manual`). A changed `ETag` on an approved
  clip sets it back to `suggested` with `changed` (review queue); a clip gone from the index is flagged `missing`, and
  its mirrored copy keeps working for puzzles already frozen.
