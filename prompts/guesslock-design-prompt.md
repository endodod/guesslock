# Design Prompt: GUESSLOCK — The Daily Deadlock Guessing Game

> Companion to the build prompt (`guesslock-build-prompt.md`). That prompt defines data, the daily engine and mode mechanics. This one defines **brand, visual design, UX and gameflow**. If the two conflict on mechanics, the build prompt wins. For names, copy and visuals, this one wins.

## 1. Concept

**Name:** GUESSLOCK. Tagline: *"Pick today's lock."*
**Domain:** `guesslock.paulkuehn.ch`

Deadlock's world is 1920s New York-ish, full of art deco, brass, the occult and souls. GUESSLOCK leans into the "lock" in the name. The site is an old **vault room**. Every day, 11 answers are locked away in brass safe-deposit boxes, and the player picks each lock by guessing. Each mode is a **lock**, and solving it swings the box door open.

Other Deadlock dles look like generic Wordle clones with a Deadlock skin. GUESSLOCK should feel like its own place: a dim vault with a wall of boxes, not a web form.

**Two rules for the theme:**
1. **Theme the frame, never the clarity.** Every themed name has a plain subtitle ("The Visage — guess the hero from their portrait"). A new player must understand every screen within 5 seconds.
2. **Atmosphere is subtle.** Grain, glow and metal sheen are low-intensity. No jump scares, no autoplay audio, no heavy effects on clue images.

## 2. Mode names (the locks)

The 11 modes form two rows of boxes.

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

**The Curiosity Shop** (item modes; the name comes from the in-game shop)

| # | Lock | Plain subtitle | Mode |
|---|---|---|---|
| VIII | The Relic | Guess the item from its icon | Item Picture |
| IX | The Appraisal | Guess the item by attributes | Item Classic |
| X | The Lineage | Guess what builds into what | Build Path (easy) |
| XI | The Measure | Guess the item's hidden stat value | Stat Bonus |

Each box carries a Roman numeral on an engraved brass plate, which gives the locks a fixed order.

## 3. Visual design system

### Palette (CSS variables, dark only in v1)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0E0D0B` | Page background |
| `--iron` | `#1A1816` | Surfaces, box doors |
| `--velvet` | `#3E1A1D` | Oxblood accents, box interiors, "miss" tiles |
| `--brass` | `#C9A45C` | Primary accent, plates, deco lines, "partial" tiles |
| `--paper` | `#E8DCC4` | Primary text, aged-paper panels |
| `--ash` | `#8A8175` | Secondary text, disabled |
| `--ecto` | `#7FE3C2` | Soul glow: "match" tiles, success, focus rings |
| `--cursed` | `#8C6BD8` | Rare highlights: streak flame, bonus rounds |

**Feedback colors:** match = `--ecto`, partial = `--brass`, miss = `--velvet` with an `--ash` border. Feedback never relies on color alone. Every tile also has an icon (✓ / ≈ / ✗) and, for numeric values, an arrow (↑ / ↓).
**Colorblind mode:** a settings toggle switches to high-contrast blue/orange/grey and adds pattern fills.

### Typography (Google Fonts)

- **Display:** *Limelight* (art deco). Use it only for the logo, lock titles and big win moments.
- **Body/UI:** *Spectral*. Readable serif with a period feel.
- **Numbers & data:** *IBM Plex Mono*. Used for stats, numeric tiles, countdowns and share text previews.
- Lock titles are set in small caps with letter-spacing. Body text is 16px min, 17–18px on mobile.

### Motifs & texture

- **Deco frame:** thin brass double-rule borders with stepped art deco corners. It's the signature element, used on boxes, panels and modals, and built as an SVG/CSS component rather than images.
- **Logo:** the wordmark "GUESSLOCK" in Limelight, with the O drawn as a keyhole.
- **Lockpicks:** each lock shows a row of lockpicks (see §6). Wrong guesses snap them.
- **Keyhole:** the hover/selection indicator on the home wall is a glowing keyhole on the focused box. The loading spinner is a key slowly turning in a keyhole.
- **Tumblers:** tiny pin tumblers drop into place during reveals, as a decorative accent in the rite header.
- **Grain overlay:** fixed, very low-opacity noise over the page. It never sits over clue images.
- **Soul glow:** soft `--ecto` blur leaking from inside a box when it opens. Used only on success states and the focused input.
- **Iconography:** thin-line brass icons. Never use emoji in the UI; emoji appear only in share text.

### Motion (Framer Motion)

- Box door swing for reveals (≈450ms, 3D rotateY on the hinge side), lockpick snap, keyhole glow pulse, and tiles revealing left-to-right one by one (≈120ms stagger) in the attribute modes.
- `prefers-reduced-motion`: replace all motion with fades. No swing, no snap, no pulse.

### Sound (optional)

- Off by default. Settings toggle.
- A lock click on a correct guess, a small metallic tick on a wrong guess, a heavy door creak on the daily-complete moment. No ambient loop.

## 4. Site map

| Route | Themed name | Purpose |
|---|---|---|
| `/` | The Vault | Home: today's 11 locks |
| `/lock/[slug]` | (lock name) | Play one mode |
| `/ledger` | The Ledger | Personal stats & streaks |
| `/archive` | The Archive | Calendar of past days, replayable |
| `/how-to-play` | The Rules | Rules for every lock |
| `/about` | — | About, credits, Valve disclaimer |
| `/admin` | — | Curation (see build prompt), unthemed and plain |

Global header: logo (left), date + countdown to the next reset (center), Ledger / Archive / Settings icons (right).
Global footer: fan-made disclaimer, "Yesterday's answers" link, credits.

## 5. The Vault (home)

**Layout:** a wall of brass safe-deposit boxes, seen head-on. The Spirits form the top row (7 boxes), The Curiosity Shop the bottom row (4 boxes, visually larger). On mobile, the rows become two vertically stacked 2-column grids.

**Each box shows:**
- Numeral plate, lock name and plain subtitle
- A state:
  - **Locked:** closed door with a keyhole
  - **In progress:** keyhole glowing faintly, a small tag with the guess count
  - **Opened:** door swung open, the answer's art visible inside, guess count and souls earned on the tag
  - **Jammed** (The Measure failed): door opened but desaturated, with a scratch mark around the keyhole
  - **Sealed today** (e.g. The Belongings with no analytics): door with a wax seal and the text "Sealed — back tomorrow"
- The focused or hovered box's keyhole glows `--ecto`.

**Above the wall:**
- The **Soul Tally**: today's total souls (§8) and a progress line such as "4 / 11 locks open".
- A **"Continue"** button that opens the next unsolved lock in numeral order.

**Below the wall:** the countdown and a "Yesterday's answers" link.

**Daily complete:** when all available locks are done, the whole wall glows softly from inside, and a panel reads *"The vault is open."* It shows the total souls, the best lock, a combined share button, the streak and the countdown.

## 6. Lock screen (shared layout for all 11 modes)

Top to bottom (desktop centered column max ~760px; mobile full width):

1. **Lock header:** back to Vault · numeral + lock name + subtitle · "?" rules popover · date.
2. **Lockpick row:** 6 picks (Build Path: 6, The Measure: 5, matching their try limits).
   - Unlimited modes: picks mark hint thresholds instead of lives. Each wrong guess snaps one. When a pick tied to a hint snaps, that hint unlocks with a small brass "Hint revealed" label.
   - After the last pick, guessing continues. The broken picks stay broken.
3. **Clue stage:** the mode's clue inside a deco frame, e.g. an image, a text panel, an item row or a stat block. This is the visual focus of the screen.
4. **Guess input:** autocomplete with icon + name.
   - Mobile: sticky to the bottom; opens as a bottom sheet with large rows.
   - Already-guessed entries are greyed and struck through.
   - Placeholder copy: "Name the hero…" (hero locks) / "Name the item…" (item locks) / "Enter a number…" (The Measure).
5. **Hint shelf:** locked hints as small closed drawers with an unlock condition ("Unlocks after 4 wrong guesses"). Unlocked hints slide open.
6. **Guess history:** newest on top.
   - Attribute modes: the tile grid, with a sticky first column (the guessed icon) and horizontal scroll on mobile.
   - Other modes: compact rows with icon, name and a ✗ mark.

**Per-lock clue stage specifics:**
- **The Reckoning / The Appraisal:** column headers carry a small info icon that explains each attribute. The legend (✓ ≈ ✗ ↑ ↓) sits above the grid.
- **The Visage / The Relic:** the image is shown through a round "peephole" frame. The zoom or blur steps down with each wrong guess, with a smooth transition.
- **The Sigil:** the icon is drawn on a tile grid. Removed tiles slide away like tumblers.
- **The Testament / The Incantation / The Ascension:** text on an aged-paper panel in Spectral. Redacted spans are drawn as black censor bars. New chunks or tiers fade in, and their label (e.g. "T2") is shown in brass.
- **The Belongings:** item icons appear one by one on the velvet lining of an open box. Each icon shows its slot color edge and a tooltip with the item name.
- **The Lineage:** two item slots joined by an arrow. One is filled, the other shows a "?". The direction label changes with the day ("builds into →" / "← built from").
- **The Measure:** the item card with all its stats, and the hidden one as a glowing blank "+??% Fire Rate". Guesses appear on a vertical brass dial that narrows the range visually with each ↑/↓, like a combination lock.

## 7. Gameflow

### First visit
- A short onboarding overlay of 3 cards: what GUESSLOCK is, how locks work, and how lockpicks/souls work. It has a "Skip" button, never shows again once dismissed, and can be reopened from `/how-to-play`.
- Then the Vault, with the "Continue" button pulsing once.

### Playing a lock
1. Open the lock → the clue stage animates in → focus lands in the guess input.
2. **Wrong guess:** a lockpick snaps, the guess is added to the history, and the clue advances if the mode reveals more. If a pick tied to a hint snapped, that hint unlocks.
3. **Correct guess:** the input locks → a click, and the remaining picks glow `--ecto` → the box door swings open with the answer's art inside → the **Win panel** appears (below).
4. **Loss** (The Measure after 5 tries): the lock jams, and the answer is revealed with the exact value. The streak is kept but the lock earns 0 souls (§8).
5. Progress is saved to `localStorage` after every guess. Reloading restores the exact state, including snapped picks and unlocked hints.

### Win panel
- Answer name + art, and the number of guesses.
- Souls earned (animated count-up).
- The player's guess distribution for this lock.
- **Buttons:**
  - Share
  - Next lock: goes to the next unsolved one by numeral; if none are left, it goes to the "vault is open" state
  - Back to Vault
- Bonus round where the mode has one (The Sigil / The Incantation: "Name the ability"), shown as a `--cursed`-tinted mini card. It's optional and awards bonus souls.

### Day rollover
- At 00:00 Europe/Zurich, the countdown hits zero. If a lock is open, a toast appears: "New locks are in the vault." There is no forced reload: the current lock can still be finished, but it counts toward the old day.
- The Vault refreshes on the next visit.

### Archive
- A calendar grid where each day shows an 11-dot summary.
- Clicking a day opens its Vault in "archive mode": a brass banner reads "Archive — doesn't count toward your Ledger".

## 8. Scoring, streaks & sharing

**Souls** (per lock):
- `souls = max(10, 100 − 10 × (guesses − 1)) − 15 × hintsUsed`, minimum 10 on a win.
- A loss earns 0.
- A bonus round win adds +25.
- The **Soul Tally** is the daily total. It's shown in the Vault and in the combined share.

**Streak ("Days unlocked"):**
- A day counts if at least one lock is solved.
- Separate per-lock streaks are kept in the Ledger.
- A streak flame icon in `--cursed` sits next to the streak count.

**Share text** (plain text, spoiler-free):

Per lock:
```
GUESSLOCK #142 — The Visage
🔓 4 picks · 70 souls
guesslock.paulkuehn.ch
```

Combined (daily complete):
```
GUESSLOCK #142 — 11/11 locks · 812 souls
Spirits  ✨✨🔓✨✨✨🔓
Shop     ✨✨✨🔒
🔥 12 days
guesslock.paulkuehn.ch
```
- ✨ = solved within the first 3 guesses, 🔓 = solved later, 🔒 = failed.
- Attribute modes additionally allow an optional tile-grid share (🟩🟨🟥).

**The Ledger** (stats page):
- Totals: days unlocked, current and best streak, total souls.
- Per lock: win %, average guesses, guess distribution histogram.
- A heatmap calendar of souls per day.

## 9. Settings

- Colorblind mode
- Reduced motion (defaults to the OS setting)
- Sound on/off
- Hard mode toggles: grayscale for The Visage/The Relic, rotation for The Relic, no hints
- Reset local data (with a confirmation dialog)

## 10. Copy & tone

- The voice is dry, short and a little ominous, like an old vault keeper. It's never cutesy and never long.
  - Correct: "Click." / "Opened in 3."
  - Wrong guess: no text. The snapped pick says enough.
  - Empty states: "Nothing in this box today."
  - Errors: "The lock won't turn. Try again."
- Plain-language rules on `/how-to-play`, with no themed jargon.
- English only in v1. Keep all strings in one i18n file, since German may follow.

## 11. Accessibility & responsiveness

- WCAG AA contrast on all text. `--paper` on `--ink` and `--iron` must be checked, and brass on dark only at ≥18px or bold.
- All interactions work by keyboard. Focus rings use `--ecto`.
- Every image has alt text. Clue images get neutral alt text ("Today's clue image") so the answer doesn't leak.
- Tap targets ≥44px. Design mobile-first at a 360px width. The attribute grid scrolls horizontally with a sticky first column.
- Performance: the Vault loads with no layout shift, images are lazy-loaded, fonts use `font-display: swap`, and the grain overlay is one tiny tiled PNG.

## 12. Deliverables

1. Design tokens (CSS variables + Tailwind theme extension) and font setup
2. Core components: `DecoFrame`, `VaultBox` (all states), `LockpickRow`, `KeyholeLoader`, `GuessInput` (desktop dropdown + mobile bottom sheet), `AttributeGrid`, `HintShelf`, `WinPanel`, `ShareButton`, `Countdown`, `Toast`
3. Pages: Vault (incl. daily-complete state), lock screen template + the 11 clue-stage variants, Ledger, Archive, Rules, About, Settings modal, onboarding overlay
4. A `/styleguide` dev-only page showing every component in every state
5. Verify every screen at 360px, 768px and 1440px, with reduced motion and colorblind mode on
