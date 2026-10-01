# Prompts

| Folder | What is in it |
|---|---|
| *(this folder)* | **Specs of the shipped product.** The build and design prompts plus one addendum per mode family (Cipher/Echo, Omens, Resonance, Séance). Living reference: the README links to them. |
| [`todo/`](todo/) | **Prompts still to be run.** Hand one to an agent as-is; each lists what is done, what is left and how to verify it. |
| [`done/`](done/) | **Finished or obsolete prompts** (one-off fixes and merge handoffs whose work is complete). Kept for history only; don't run them again. |

When a `todo/` prompt is finished, move it to `done/`.

## Now in `todo/`
- [`game-consistency-qa.md`](todo/game-consistency-qa.md): test every game for complete flow, consistency, missing data, and general product feedback, starting with The Reckoning.

- [`mode-fixes.md`](todo/mode-fixes.md): playtest fixes per mode (implemented; move to `done/` after review).
- [`hard-mode.md`](todo/hard-mode.md): hard mode per mode; implemented except The Testament/Incantation rewrites and The Ascension.

## Now in `done/`
- [`new-gamemodes-and-home-placeholders.md`](done/new-gamemodes-and-home-placeholders.md): The Shadow, Arsenal, Calculus, Decoy, Cache, Constellation and Wayfinder; all playable.
- [`fix-sealed-modes.md`](done/fix-sealed-modes.md): Cipher, Clash, Beast and Rift were sealed; all four are open in production now.
- [`handoff-merge-resonance-seance.md`](done/handoff-merge-resonance-seance.md): merging The Resonance and The Séance; merged and live.
- [`handoff-admin-ui-and-agent-api.md`](done/handoff-admin-ui-and-agent-api.md): admin pages restyled, routes/build verified, and the secured agent API completed.
