# Addendum Prompt: GUESSLOCK — The Resonance (Sound Mode)

> Extends `guesslock-build-prompt.md`, `guesslock-design-prompt.md`, `guesslock-addendum-emoji-quote.md` and `guesslock-addendum-omens.md`. Everything in those still applies. This file adds one hero lock: the player **hears an ability sound and names the hero**, then names the ability in a bonus round. Where this file conflicts with the others, this file wins.

## 1. Summary

- New Spirits lock **The Resonance** — *"Guess the hero from an ability sound."*
- Audio comes from deadlock-api's **sound index**, curated per ability in the admin page, and mirrored to our own storage like images.
- Main guess: the **hero**. Bonus round (like The Sigil): **name the ability**, 4 options.
- Numbering: The Resonance joins The Spirits as **X**. The Curiosity Shop and The Omens shift by one (Shop XI–XIV, Omens XV–XVII). Numbering lives in `locks.config.ts` and local data is keyed by slug, so nothing else needs renumbering.

## 2. Data source (researched, verify in Step 0)

**Sound index:** `GET https://api.deadlock-api.com/v1/assets/sounds`. The OpenAPI summary is *"Nested file-tree of all hosted sounds, mapping each name to its public CDN URL."* A snapshot from 2026-09-30:

- ~16 MB of JSON. It's a tree of folders; leaves are CDN URLs, for example `https://assets-bucket.deadlock-api.com/assets-api-res/sounds/abilities/abrams/a2_charge/abrams_a2_charge_wall_impact.mp3`.
- Formats: ~118,000 `.mp3`, 14 `.wav`.
- Top-level folders relevant here:

| Folder | Files | Use |
|---|---|---|
| `abilities/<codename>/…` | ~2,770 across 51 folders | **Main clue source** |
| `weapons/<codename>/…` | ~2,780 | Hint: the hero's gun sound |
| `vo/<codename>/…` | ~105,000 | Not used here (voice lines; see §10) |

- **Codename ↔ hero mapping is not 1:1.** Most folders match the hero's `class_name` without `hero_` (Haze → `haze`, Calico → `nano`, Ivy → `tengu`, Grey Talon → `orion`). Known exceptions in the snapshot:
  - Abrams is `hero_atlas`, but the ability folder is `abilities/abrams`.
  - Mo & Krill is `hero_krill`, but the ability folder is `abilities/mokrill`.
  - Lady Geist (`ghost`), Abrams, Pocket (`synth`) and Sinclair (`magician`) have **no weapon folder under their codename**. Search for it (e.g. `geist`, `abrams`) before concluding it's missing.
  - The index also contains **unreleased/test heroes** (`archer`, `architect`, `cadence`, `fathom`, `kali`, `operative`, `sentry`, `tokamak`, `trapper`, `wrecker`, …). Never use folders that don't map to an active hero.
- **Clip ↔ ability mapping is by filename, not by ID.** For example, Haze's folder contains `haze_sleep_dagger_cast`, `haze_sleep_dagger_hit`, `haze_smoke_bomb_cast`, `a2_smoke_bomb/…` and `haze_bullet_flurry_cast_start`. Ability class names are `ability_sleep_dagger`, `ability_smoke_bomb`, `ability_bullet_flurry` (Bullet Dance) and `ability_stacking_damage` (Fixation, a passive with **no** sound). Expect:
  - slot prefixes (`a1_`…`a4_`), internal names that differ from display names, and abilities without any clip
  - many tiny variants (`_01`…`_06`), loops (`_lp`), whiz-bys and impacts, of which the **cast** sound is usually the most recognizable
- **Cross-check source:** the Deadlock Wiki's `<Hero>/Sounds` pages (MediaWiki API, as used for The Echo) group files by context, e.g. "Weapon", "Audio plays when Haze is reloading". Use them only to help the admin label clips, never as a runtime source.
- **Rights:** the sounds are Valve game assets, the same as the portraits and icons already used. They're covered by the site's existing fan-project disclaimer. Credit deadlock-api as the host on the About page.

## 3. Step 0 — Data spike (do this first, report before building)

Write `docs/resonance-data-spike.md` with:

1. The current top-level shape of `/v1/assets/sounds` and whether it changed from §2.
2. The **codename → hero table** for every active hero: ability folder, weapon folder, and how each was found (exact match / alias / manual).
3. For 5 heroes (include Abrams, Mo & Krill and one hero with a multi-part ability, e.g. Holliday or Rem): the list of clips per ability after automatic matching (§4), and which abilities got **no** clip.
4. Duration and loudness of 30 sampled clips: min/median/max duration, peak and RMS (or LUFS). Decide on a normalization target.
5. Whether clip filenames or URL paths could leak the hero (they do: codenames are in the path). Confirm the mirroring plan in §5 removes that.

**Stop and wait for review** if the index turns out to be unusable (e.g. most active heroes missing).

## 4. Curation model

This mode can't be fully automatic, because clip → ability labels need a human check. Follow the same pattern as texts: the automatic pass suggests, the admin confirms, and **nothing unreviewed is used**. This deliberately differs from the auto-open text locks: a wrong sound is unfair in a way a slightly clumsy redaction isn't.

```
SoundClip {
  id, sourceUrl (unique), sourcePath (index path), heroId?, abilityId?,
  kind: "ability" | "weapon",
  role: "cast" | "impact" | "loop" | "other",   // guessed from the filename, editable
  durationMs, peakDb, gainDb,                    // measured at import
  assetId?,                                      // mirrored MediaAsset (opaque /media/<sha1> URL)
  status: "suggested" | "approved" | "excluded",
  sourceHash, importedAt
}
HeroSoundMap { heroId, abilityFolder, weaponFolder, source: "auto" | "manual" }
```

**Import (admin-triggered, plus a check in the daily sync):**
1. Fetch the index, resolve each active hero's folders via `HeroSoundMap`. Auto-fill it from the codename rule, and flag heroes whose folder wasn't found.
2. For each ability of the hero, score clip paths against tokens from the ability's `class_name` and display name (`sleep_dagger`, `smoke bomb`), plus the slot prefix (`a1`…`a4`). Keep clips scoring above a threshold as `suggested`.
3. Guess `role` from the name (`cast`, `impact`/`hit`, `_lp`/`loop`, else `other`). Skip whiz-bys, `_end` stingers and clips under 250 ms by default.
4. Measure duration and loudness (a WASM MP3 decoder in Node is fine, no native ffmpeg needed on Vercel). Store `gainDb` so every clip plays at the same loudness.
5. Weapon clips: pick the hero's `*_weapon_fire_*` family (not reloads) as the weapon hint.
6. Re-imports never overwrite admin decisions. A changed `sourceUrl`/`sourceHash` marks the clip `suggested` again and puts it in the review queue.

**Mirror on approval:** download approved clips into our own storage and serve them from `/media/<sha1>` like images, never from the API URL. Clips are small (tens of KB), so mirroring approved ones only keeps storage low (~150 abilities × 2–3 clips).

**Eligibility:** an ability is eligible when it has **at least 1 approved `cast` clip** and in total **≥ 2 approved clips**. A hero is eligible when it has ≥ 1 eligible ability. The usual `excludeFromMode[]` flags apply.

## 5. Leak rules (critical)

- The client must never receive a source URL, a sound index path or a filename, because they all contain the hero's codename (`…/abilities/haze/haze_sleep_dagger_cast.mp3`).
- Clips are served only as opaque `/media/<sha1>` URLs, which are already used for images and are content-addressed by the source URL.
- The payload lists clip URLs in reveal order, but a clip URL is sent only once it's unlocked (same stateless `/api/play` pattern as the other modes).
- Extend the leak validator: for The Resonance, assert that no displayed or served string contains a hero codename or name, and that every audio URL matches `/media/[a-f0-9]{40}`.

## 6. Gameplay

**Daily puzzle:** seeded pick of one eligible ability (the no-repeat window keys on the **hero**, like The Sigil).

**Reveal ladder** (each wrong guess unlocks the next step; lockpicks: 6):

| After wrong guesses | Player gets |
|---|---|
| 0 | Clip 1: the **cast** sound, with a gentle low-pass filter (muffled, as if heard through the vault door) |
| 1 | Clip 1 unfiltered |
| 2 | Clip 2: a second approved clip of the same ability (impact/loop) |
| 3 | **Hint:** ability slot (Ability 1–3 / Ultimate) |
| 4 | **Hint:** the hero's **gun sound** (weapon clip) |
| 6 | **Hint:** hero archetype |

- Unlimited guesses and the standard souls formula. Hints unlocked before the win count against souls as usual.
- The filter is applied client-side with Web Audio (`BiquadFilterNode`, low-pass ~700 Hz), not a separate file.
- **Bonus round** after the win: "Name the ability": 4 options (this hero's abilities), +25 souls, identical to The Sigil.
- **After the win:** all clips unfiltered, the ability icon and name, and a "Play again" button for each.
- **Hard mode** (existing settings group): "Muffled only". The unfiltered step is skipped, and the filter stays until the win.

## 7. Audio UX & accessibility

- **Never autoplay.** Every clip starts from a user tap or keypress (browser autoplay rules and the design prompt both require this). Space or Enter on the focused player toggles play.
- **Player control** (clue stage): a large brass **gramophone horn / speaker grille** button inside a deco frame, a thin `--ecto` progress ring while playing, and a waveform-free design (a waveform image could leak length/shape between days; keep it abstract).
  - One control per unlocked clip, labelled "Sound 1", "Sound 2", "Gun". Never label a clip with its role or name before the win.
  - A small replay counter is fine; replays are free.
- **Volume:** play at the stored `gainDb`. A global volume slider in Settings ("Sound locks volume"), separate from the SFX toggle.
- **iOS:** the silent switch mutes Web Audio on some iOS versions. Show a one-line tip on first play: "No sound? Check your silent switch."
- **Accessibility:** this lock can't be made accessible to Deaf players, so it must never block anything.
  - Setting: **"Skip sound locks"**. When on, The Resonance shows as "Skipped" in the Vault, isn't counted in "x / N locks open", doesn't appear in the combined share line, and doesn't affect streaks.
  - The rules popover says plainly that this lock needs audio.
- **Reduced motion:** no pulsing speaker animation; the progress ring still updates.

## 8. Design

- **Name:** The Resonance. **Plain subtitle:** "Guess the hero from an ability sound."
- **Vault box:** same states as other Spirit locks. The keyhole plate shows a small engraved sound-wave glyph so the box is recognizable.
- **Vault layout:** The Spirits now have 10 boxes. Desktop: 5 × 2. Tablet: 5 × 2. Mobile: the existing 2-column grid (5 rows, no orphan). The Curiosity Shop and The Omens are unchanged.
- **Share:** per-lock format as usual, e.g. `GUESSLOCK #142 — The Resonance` / `🔓 3 picks · 80 souls`. The combined Spirits line gets a 10th symbol.

## 9. Admin additions

- **Sound curation page** (`/admin/sounds`): per hero, the folder mapping (editable), and per ability a list of suggested clips with inline play buttons. Controls: approve/exclude and set the role, a "prefer as clip 1" star, and the measured duration/gain.
- **Review queue:** heroes without a folder mapping, eligible abilities below the clip minimum, clips whose source changed.
- **Calendar:** The Resonance appears like other locks (preview plays the clips).

## 10. Out of scope (note only)

- **The Echo audio:** `vo/<codename>/…` contains ~105,000 voice clips. The Echo is currently text-only by decision. Matching wiki lines to these files (by the `Audio link` filename) could later enable its audio hint. Don't build it here.
- A **gun-only lock** ("guess the hero from their weapon") is possible with the same pipeline, but it isn't part of this addendum.

## 11. Tests

- **Mapping:** the codename resolver returns the right folders for all active heroes in a fixture index, including the Abrams/`abrams` and Mo & Krill/`mokrill` exceptions, and ignores unreleased folders.
- **Matching:** clip → ability scoring matches a hand-labelled fixture for 5 heroes (precision ≥ 0.9 on `cast` clips).
- **Eligibility:** abilities without an approved cast clip are never picked; excluded heroes are never picked.
- **Leaks:** payloads and `/api/play` responses contain only `/media/<sha1>` audio URLs, and no codenames, filenames or names before the win. A locked clip's URL is never sent early.
- **Skip setting:** with "Skip sound locks" on, the Vault count, combined share and streak logic ignore The Resonance.
- **Loudness:** after `gainDb`, sampled clips land within ±2 dB of the target.
