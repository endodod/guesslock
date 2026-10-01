> **Status: done.** All seven modes are playable (XXIII The Shadow … XXIX The Wayfinder, see the README locks table), so
> no placeholder cards remain. Departures from this prompt, decided while implementing:
> - The Wayfinder became a real lock (the user asked for it): a zoomed minimap crop around a real hero position from the
>   Omens harvest; pin it on the map (the mirrored spot counts too).
> - The Arsenal: the API has no weapon art, so it uses curated cut-outs (admin setup) and stays sealed until one exists.
> - The Constellation uses typed names with no suggestions; 4 lives; 10 souls per filled cell + 10 for a full grid.
> - Hard mode is a general feature (README "Hard mode"), not only for these modes.

# New game modes and home-page placeholders

> Implementation prompt. This prompt is intentionally separate from the existing shipped-mode prompts: inspect the current code before changing any shared contracts, and do not assume the older 11-mode design document is still authoritative.

## Goal

Extend Guesslock with the next family of puzzle concepts from `prompts/todo/my_findings.md`. The home page must visibly reserve space for the new family now, while every mode remains honest about whether it is playable. A placeholder must never look like a working daily puzzle or create a dead link.

The current home page is rendered by `src/components/Vault.tsx`. The current lock source of truth is `src/locks.config.ts`; playable mode implementations are registered in `src/lib/engine/registry.ts`. Read those files and the current route/data-generation flow before editing.

## Proposed modes

Use these provisional product names and subtitles, which follow the existing "The ___" lock vocabulary. Keep internal slugs stable and explicit when the modes become playable. The following behavior is the product requirement:

### 1. The Shadow: hero silhouette

- The player guesses the hero from a silhouette.
- Normal mode should reveal more of the silhouette or image as wrong guesses progress.
- Hard mode uses a tighter, more zoomed-in crop so the silhouette is less recognizable.
- Use a deterministic daily crop/reveal state and ensure the answer cannot leak through payload text, filenames, alt text, URLs, or client-visible metadata.

### 2. The Arsenal: weapon silhouette

- The player guesses the hero from the silhouette of that hero's weapon.
- Normal mode should progressively reveal the weapon silhouette or its identifying detail.
- Hard mode uses a tighter or more zoomed-in presentation.
- Define what happens when a hero has incomplete or unavailable weapon art; exclude or seal the puzzle intentionally rather than rendering a broken clue.

### 3. The Calculus: ability stats

- The player guesses the ability from its stats.
- The clue includes all supported numeric/stat fields, including cooldown, range, and duration when present.
- Values must come from normalized API data or approved curation, never guessed values.
- Hard mode omits one ability stat from the clue. The omitted field must be selected deterministically and must be restored on win/loss according to the existing reveal conventions.
- Missing stats must have an explicit eligibility rule so incomplete abilities do not produce misleading puzzles.

### 4. The Decoy: fake item in a hero build

- Show a hero build containing one fake item and ask the player to identify the fake item.
- The normal clue may reveal the hero identity as part of the build context.
- Hard mode must not reveal the hero; the build itself is the clue.
- Define how the fake item is selected and validate that it is not a legitimate item in the selected build under the chosen data window.
- Freeze the build and fake-item choice in the daily puzzle snapshot.

### 5. The Constellation: hero/category matrix

- Present a 3x3 matrix.
- Each cell represents a hero that must match two category constraints, with the player filling the table.
- Do not provide candidate proposals or an autocomplete list that solves the matrix for the player; the player must research/search independently and enter the hero for each cell.
- The initial version has no hard mode.
- Define validation, duplicate-hero handling, completion state, partial progress persistence, and the reveal/share result.
- Category membership must come from the existing curated category system or a clearly defined new curation source.

### 6. The Cache: team inventory matching

- Choose one complete team from a past game and show the inventories from that match.
- The player matches each inventory to the correct hero on that team.
- The initial version uses one team only.
- Hard mode hides some items in each inventory while preserving enough information for a fair match.
- Freeze the source match, team, inventories, hidden-item selection, and answer mapping in the daily snapshot.
- Define behavior for incomplete match data, duplicate-looking inventories, abandoned matches, and unavailable hero/item assets.

### 7. The Wayfinder: Where Am I? (under construction)

- Reserve a card for this mode on the home page, but keep it explicitly under construction.
- Do not create a playable route, daily puzzle, answer pool, or misleading interaction for this mode yet.
- The eventual concept may identify a location/state from game context, but no gameplay contract is approved by this prompt.

## Home page requirements

- Add The Shadow, The Arsenal, and The Calculus directly after the existing Spirits locks in the same grid, so they fill the open cells beside the final Spirits locks, The Colloquy and The Resonance.
- Keep The Decoy and The Cache beneath the existing Curiosity Shop locks in their own two-card placeholder row.
- Add a two-card row beneath those groups for The Constellation and The Wayfinder.
- Use the existing Vault card treatment, typography, spacing, numerals/labels, and responsive grid conventions. Do not redesign unrelated cards.
- Add one placeholder puzzle card for each of the six concrete modes in its family row, with The Constellation beside The Wayfinder in the final row.
- Placeholder cards must clearly communicate one of these states:
  - `Coming soon` for a planned mode that has no playable daily puzzle yet.
  - `Under construction` for `Where Am I?`.
  - A normal playable/progress/opened state only after the mode has a real lock definition, generated puzzle, route, and tested completion flow.
- Placeholder cards must be non-interactive unless a real route exists. Do not send users to a fake slug, `/lock` page that crashes, or a blank screen.
- They must not count toward today's lock total, souls, streak, completion state, next-lock navigation, archive totals, or leaderboards until the corresponding mode is fully playable.
- They must not appear as sealed daily puzzles; “sealed” implies a real mode that could be available on another day.
- Keep all new rows stable on desktop and mobile, with no layout shift caused by placeholder labels or long subtitles. The Spirits row should use three equal cards, the Curiosity Shop row two cards, and the final Constellation/Wayfinder row should use two equal cards.
- Ensure accessible names state that the mode is coming soon/under construction and that the card is not currently playable.
- Do not add decorative copy that explains implementation details to players.

## Implementation boundaries

- First decide whether the codebase needs a reusable `coming soon` card or a dedicated proposed-mode data structure. Prefer the smallest abstraction that fits the current `Vault` and lock configuration patterns.
- Do not add a fake `LockDef` to `LOCKS` merely to render a card if doing so would affect counts, puzzle generation, admin pages, APIs, archive data, or next-lock navigation.
- If a mode is made playable in this task, implement its full data contract, deterministic selection, leak validation, route rendering, persistence, scoring, share behavior, and tests. Otherwise keep it as a home-only placeholder and document the remaining implementation boundary in code or the handoff summary.
- Follow the existing daily snapshot model. Never compute a user's answer from mutable current API data after the puzzle has been generated.
- Follow existing accessibility, reduced-motion, responsive layout, and audio conventions. Do not introduce a second card visual language.
- Preserve all existing mode behavior and current Vault totals.

## Verification

- Add focused tests for any new selection, normalization, validation, persistence, and scoring logic.
- Verify that the existing test suite and typecheck pass.
- Verify the home page at desktop and mobile widths:
  - the final row is visible and aligned;
  - all seven cards have stable dimensions;
  - long titles/subtitles do not overlap or resize neighboring cards;
  - placeholder cards cannot be opened;
  - existing totals, Continue navigation, daily completion, archive views, and progress counts exclude placeholders.
- Verify that a placeholder cannot be reached through direct navigation and that its accessible label communicates its unavailable state.
- Check leak validation for every newly playable mode before generating or exposing daily puzzles.

## Out of scope

- Do not implement a vague `Where Am I?` game beyond its home-page placeholder.
- Do not redesign the existing Vault or renumber existing locks without a separate product decision.
- Do not silently convert placeholders into sealed locks.
- Do not update only the old design/build prompts and claim the feature is implemented; the runtime behavior and tests are the source of truth.
