# Game Consistency QA

> Living QA prompt. Start with The Reckoning, then work through every game mode. Record findings here as they are discovered. Do not silently discard observations; move resolved items to the completed section with the commit or verification that closed them.

## Working rules

- Test one game mode at a time, starting with **The Reckoning**.
- Check the complete player flow, not only the puzzle answer.
- Separate data/content problems from game logic, UI, copy, audio, and infrastructure problems.
- Reproduce each issue twice when practical: once as a fresh player and once after refreshing or returning to the game.
- Record the exact date, mode, lock, browser/device, account state, and seed or puzzle identifier when available.
- Do not change production data while investigating. Use local or preview data for destructive or write operations.
- When a finding is sent in chat, add it to the relevant section before fixing it.
- Keep the original observation when correcting an item so the reason for the change remains clear.

## Status legend

- `[ ]` Not checked
- `[-]` In progress
- `[x]` Verified or fixed
- `[!]` Blocked or needs a product decision

## Test context

- Date tested:
- Environment: local / preview / production
- Browser and version:
- Device and viewport:
- Account state: signed out / signed in / new account / returning account
- Puzzle date and lock:
- Build or commit:

## Test pass template

### 1. Entry and navigation

- [ ] The game is reachable from the intended entry point.
- [ ] The correct title, lock name, numeral, subtitle, and artwork appear.
- [ ] The game can be opened from the home page, archive, and any related navigation.
- [ ] Back, refresh, direct URL, and browser history preserve a sensible state.
- [ ] Loading, empty, sealed, unavailable, and error states are understandable.

### 2. Gameflow

- [ ] The game explains enough before the first action.
- [ ] The first playable state is valid and contains the expected clues or board data.
- [ ] Each wrong guess reveals the intended next clue or state.
- [ ] Guess validation handles empty, invalid, duplicate, near-match, and correct input correctly.
- [ ] Attempts, score, souls, streaks, progress, and timers update at the right moment.
- [ ] The game cannot skip required steps or get stuck between steps.
- [ ] Refreshing, navigating away, signing in, and returning do not corrupt progress.
- [ ] The correct answer resolves the game exactly once.
- [ ] Wrong-answer, sealed, timeout, and abandon flows behave correctly.
- [ ] Win, loss, reveal, share, replay, and next-game actions lead to the expected destination.
- [ ] Audio, animation, haptics, and reduced-motion behavior do not block play.

### 3. Content and data

- [ ] The answer exists and belongs to the intended answer pool.
- [ ] The answer is not leaked in clue text, alt text, URLs, metadata, client state, or source payloads.
- [ ] Every clue is present, ordered correctly, and appropriate for the answer.
- [ ] Hints are available at the intended thresholds and have correct costs.
- [ ] Images, icons, voice lines, sounds, quotes, emojis, categories, and metadata load.
- [ ] No stale, placeholder, duplicate, missing, malformed, or contradictory data appears.
- [ ] Long names, aliases, punctuation, accents, and unusual values render correctly.
- [ ] The same entity is named and represented consistently across the game and admin views.
- [ ] Sealed or incomplete data produces an intentional fallback instead of a broken puzzle.

### 4. UI and accessibility

- [ ] Desktop layout works at 1440 px.
- [ ] Mobile layout works at 390 px without horizontal page scroll.
- [ ] Text, controls, clues, images, and dialogs do not overlap.
- [ ] Primary actions are obvious and disabled or pending states are visible.
- [ ] Keyboard navigation, focus order, labels, and visible focus states work.
- [ ] Color is not the only status signal and contrast is sufficient.
- [ ] Screen-reader names describe controls and meaningful media.
- [ ] Errors are visible near the action that caused them.

### 5. Account, persistence, and safety

- [ ] Signed-out and signed-in behavior is intentional.
- [ ] A new user can begin without stale state from another user.
- [ ] Returning to a game restores only the correct user's progress.
- [ ] Logout, account switching, and session expiry do not expose another user's state.
- [ ] Repeated clicks and replayed requests do not duplicate rewards or submissions.
- [ ] API and server actions enforce the same game rules as the UI.

### 6. Admin and operations

- [ ] The admin page shows the same game state as the player page.
- [ ] The puzzle schedule, answer pool, status, and sealed reason are correct.
- [ ] Missing or flagged data appears in the Review Queue.
- [ ] Fixes made in admin are reflected in a newly generated or rebuilt puzzle.
- [ ] Sync, generation, media, and health failures are visible and actionable.
- [ ] No debug-only controls or secrets are visible in production.

## Game passes

### The Reckoning

Status: `[-]` Start here.

Game route or lock slug:

Test notes:

#### Findings

<!-- Add findings using the format below. Keep the newest finding at the bottom. -->

- ID: RECKONING-001
  - Status: `[ ]`
  - Severity: blocker / high / medium / low / polish
  - Area: flow / content / data / UI / accessibility / audio / account / admin / security
  - Location: screen, step, or URL
  - Observation:
  - Steps to reproduce:
  - Expected:
  - Actual:
  - Test context:
  - Evidence:
  - Proposed fix or product decision:
  - Verification:

#### Completed

- None yet.

### The Visage

Status: `[ ]`

Findings: None yet.

### The Sigil

Status: `[ ]`

Findings: None yet.

### The Testament

Status: `[ ]`

Findings: None yet.

### The Incantation

Status: `[ ]`

Findings: None yet.

### The Belongings

Status: `[ ]`

Findings: None yet.

### The Ascension

Status: `[ ]`

Findings: None yet.

### The Cipher

Status: `[ ]`

Findings: None yet.

### The Echo

Status: `[ ]`

Findings: None yet.

### The Resonance

Status: `[ ]`

Findings: None yet.

### The Relic

Status: `[ ]`

Findings: None yet.

### The Appraisal

Status: `[ ]`

Findings: None yet.

### The Lineage

Status: `[ ]`

Findings: None yet.

### The Measure

Status: `[ ]`

Findings: None yet.

### The Omens

Status: `[ ]`

Findings: None yet.

### The Seance

Status: `[ ]`

Findings: None yet.

## General Feedback

Use this section for feedback that applies to the product as a whole or does not belong to one game.

### Product and game feel

- `[ ]` Is the overall loop understandable without outside explanation?
- `[ ]` Is the difficulty curve coherent across games?
- `[ ]` Are rewards, souls, streaks, and replay incentives understandable and worthwhile?
- `[ ]` Are there places where the game feels slow, repetitive, unfair, or confusing?
- `[ ]` Are the names, tone, writing, and visual language consistent?

### Cross-game consistency

- `[ ]` Do shared controls behave the same way in every game?
- `[ ]` Do hints, guesses, attempts, costs, wins, losses, and results use consistent rules and copy?
- `[ ]` Do shared entities use the same names, images, aliases, and metadata everywhere?
- `[ ]` Do navigation, loading, error, sealed, and empty states follow the same conventions?

### General findings

- ID: GENERAL-001
  - Status: `[ ]`
  - Severity: blocker / high / medium / low / polish
  - Area:
  - Observation:
  - Steps to reproduce:
  - Expected:
  - Actual:
  - Evidence:
  - Proposed fix or product decision:
  - Verification:

## Open product decisions

- None yet.

## Completed findings

- None yet.

## Verification checklist

- [ ] Every game has been tested through a complete flow.
- [ ] Every game has a content and missing-data pass.
- [ ] Cross-game consistency issues have been grouped and fixed together where appropriate.
- [ ] General feedback has been triaged into bugs, improvements, and product decisions.
- [ ] Focused tests pass for each fix.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx eslint src scripts` passes.
- [ ] `npx vitest run` passes.
- [ ] Relevant screenshots or recordings were reviewed at desktop and mobile sizes.
