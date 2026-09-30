# Addendum Prompt: GUESSLOCK — Emoji & Quote Modes

> Extends `guesslock-build-prompt.md` (data, engine, mechanics) and `guesslock-design-prompt.md` (design, UX, gameflow). Everything in those prompts still applies. This file only defines what's new or changed. Where this file conflicts with the other two, this file wins.

## 1. Summary of changes

- Two new hero modes: **The Cipher** (emoji) and **The Echo** (quote).
- The Spirits row grows from 7 to 9 locks, so the total goes from 11 to **13**.
- The item locks are renumbered.
- The Vault layout, share text, Ledger and admin page are updated to match.

## 2. New numbering

**The Spirits** (hero modes)

| # | Lock | Plain subtitle | Mode |
|---|---|---|---|
| I | The Reckoning | Guess the hero by attributes | Classic |
| II | The Visage | Guess the hero from their portrait | Splash |
| III | The Sigil | Guess the hero from an ability icon | Ability Icon |
| IV | The Testament | Guess the hero from their lore | Lore |
| V | The Incantation | Guess the hero from an ability description | Ability Description |
| VI | The Belongings | Guess the hero from their build | Whose Build? |
| VII | The Ascension | Guess the ability from its upgrades | Upgrade Guesser |
| **VIII** | **The Cipher** | **Guess the hero from emojis** | **Emoji (new)** |
| **IX** | **The Echo** | **Guess the hero from a voice line** | **Quote (new)** |

**The Curiosity Shop** (item modes)

| # | Lock | Mode |
|---|---|---|
| X | The Relic | Item Picture |
| XI | The Appraisal | Item Classic |
| XII | The Lineage | Build Path (easy) |
| XIII | The Measure | Stat Bonus |

Numbering and order live in one config file (`locks.config.ts`), so future modes don't require edits across the codebase.

## 3. Mode VIII — The Cipher (emoji)

### Data
- There's no API source for this, so it's **fully curated**. Each hero gets a set of **6 emojis** in the admin page.
- Store them as an ordered list, **hardest first, most obvious last**. The order is the reveal order.
- Curation guidelines, shown in the admin editor:
  - Mix appearance, abilities, personality and lore (e.g. a hero who summons birds and wears a hat gets 🎩 and 🐦 somewhere in the set).
  - No emoji that is basically the hero's name (e.g. no 🔥 as the first emoji for a hero literally named after fire).
  - Each set must be unique: no two heroes may share the same first 3 emojis. The admin page warns about overlaps.
- **Eligibility:** only heroes with a complete, reviewed 6-emoji set. New heroes are excluded until curated (they stay guessable in autocomplete).

### Gameplay
- Start with **1 emoji** visible. Each wrong guess reveals the next one, up to all 6.
- After all 6 are shown and 2 more guesses are wrong: hint = hero gender. After 2 more: hint = the first letter of the name.
- Unlimited guesses.
- The emoji set itself is never included in the share text, because that would spoil the puzzle.

### Design
- The clue stage shows **6 slots** in a row inside a deco frame, like dials on a cipher lock. Hidden slots show a brass "?" plate. A revealed slot flips to show its emoji.
- **Emoji rendering:** render the emojis with the **Noto Emoji** font (monochrome, Google Fonts), tinted `--paper`, with a subtle `--brass` inner shadow.
  - This keeps them consistent across devices and matches the vault look better than colorful OS emoji.
  - Settings toggle: "Color emoji in The Cipher" switches to Twemoji (color) for players who find monochrome hard to read.
- On mobile, the 6 slots become 2 rows of 3.
- This is the one screen where emoji appear in the UI; the "no emoji in UI" rule from the design prompt applies everywhere else.

## 4. Mode IX — The Echo (quote)

### Data
- There's no API source for voice line text. The source is the **Deadlock Wiki** (`deadlock.wiki`), which has a voice lines directory with per-hero pages of transcriptions.
- Import method:
  - Use the wiki's MediaWiki API (`api.php`, `action=parse` or `action=query` on each hero's voice lines page), not HTML scraping.
  - Run it as an admin-triggered import, not a cron job. Store the lines in the DB.
  - Keep the source page and revision ID per line for attribution and change tracking.
- **Licensing:** wiki text is community content. Credit the Deadlock Wiki with a link on the About page and in The Echo's rules popover. Check the wiki's license page and follow its attribution terms.
- **Filtering** (automatic first, then admin review):
  - Exclude lines under 6 words. "Reloading!" says nothing about who is speaking.
  - Exclude lines containing the speaker's own name, alias or own ability names, **unless** redacted (use the redaction pipeline from the build prompt).
  - Exclude heroes that currently use **generic placeholder voice lines**. The wiki has generic temp voice line sets used for heroes without finished lines, and those would be unguessable or misleading. Flag them automatically when a hero's lines match a generic set.
  - Lines where the speaker addresses or names *another* hero are allowed. They're good clues and don't give the answer away.
- **Line quality:** admins can star lines as "iconic". Starred lines are revealed last, since they're the easiest.
- **Eligibility:** only heroes with at least 5 approved lines.

### Gameplay
- Pick 5 approved lines per puzzle: 4 regular lines in random (seeded) order, then 1 starred line last if one exists.
- Start with **1 line** visible. Each wrong guess reveals the next line, up to 5.
- After all 5 lines are shown and 2 more guesses are wrong: **audio hint** — a play button for the first line's audio clip.
  - The audio is mirrored from the wiki's files at import time and never plays automatically.
  - If no audio file exists for that line, the hint falls back to hero gender.
- Unlimited guesses.
- After winning: show all 5 lines with the speaker's portrait, and a play button next to each line that has audio.

### Design
- The clue stage styles each line as a **typed telegram strip**: aged paper, IBM Plex Mono, a brass pin on the left.
- New lines slide in from the top with a short typewriter effect (≈20ms per character). With reduced motion, lines appear instantly.
- Redacted spans use the same black censor bars as the other text modes.
- The audio hint button looks like a small brass speaker grille. While the clip plays, it shows a thin progress ring in `--ecto`.

## 5. Changes to the Vault (home)

- The Spirits now have 9 boxes. Layout:
  - **Desktop (≥1024px):** Spirits as a 3×3 block on the left, the Curiosity Shop as a 2×2 block on the right, with larger boxes.
  - **Tablet:** Spirits as a 3×3 block, the Shop as a row of 4 below.
  - **Mobile:** unchanged. Two vertically stacked 2-column grids; the last Spirits row has one box, centered.
- The progress line reads "x / 13 locks open".
- The "Continue" order follows the new numbering (I → XIII).

## 6. Changes to sharing & stats

- The combined share uses 9 symbols for the Spirits line:
```
GUESSLOCK #142 — 13/13 locks · 1040 souls
Spirits  ✨✨🔓✨✨✨🔓✨🔓
Shop     ✨✨✨🔒
🔥 12 days
guesslock.paulkuehn.ch
```
- Per-lock share for the new modes follows the existing format (e.g. `GUESSLOCK #142 — The Echo` / `🔓 3 picks · 80 souls`).
- The Ledger adds per-lock stats for The Cipher and The Echo.
- Existing players' stored data must migrate cleanly. Key all local stats by mode **slug**, not by numeral, so renumbering never corrupts saved progress.

## 7. Admin page additions

- **Emoji editor:** per hero, 6 slots with an emoji picker and drag-to-reorder. It shows an overlap warning (§3) and a live preview of the reveal order.
- **Voice line manager:**
  - An import button (per hero or all heroes) and the date of the last import.
  - A line list per hero with columns: text, word count, audio yes/no, status (approved / excluded / needs redaction), starred.
  - A "generic voice lines" flag on the hero, set automatically and editable manually.
  - Re-importing never overwrites manual edits. Changed source lines are flagged for review instead.
- The review queue from the build prompt also lists heroes that are missing a complete emoji set or have fewer than 5 approved lines.

## 8. Tests

- The Cipher: reveal order is followed; ineligible heroes are never picked; the share text contains no emojis from the set.
- The Echo: no displayed line contains the answer's name or aliases (extend the leak validation script); heroes flagged as generic are never picked; the audio hint falls back correctly when no audio exists.
- Migration: stats saved under the old 11-lock numbering load correctly under the new 13-lock layout.