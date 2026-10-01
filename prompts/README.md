# Prompts

| Folder | What is in it |
|---|---|
| *(this folder)* | **Specs of the shipped product.** The build and design prompts plus one addendum per mode family (Cipher/Echo, Omens, Resonance, Séance). Living reference: the README links to them. |
| [`todo/`](todo/) | **Prompts still to be run.** Hand one to an agent as-is; each lists what is done, what is left and how to verify it. |
| [`done/`](done/) | **Finished or obsolete prompts** (one-off fixes and merge handoffs whose work is complete). Kept for history only; don't run them again. |

When a `todo/` prompt is finished, move it to `done/`.

## Now in `todo/`
- [`handoff-admin-ui-and-agent-api.md`](todo/handoff-admin-ui-and-agent-api.md): design every admin page properly, check that every puzzle page is reachable, and build the secured agent API.

## Now in `done/`
- [`fix-sealed-modes.md`](done/fix-sealed-modes.md): Cipher, Clash, Beast and Rift were sealed; all four are open in production now.
- [`handoff-merge-resonance-seance.md`](done/handoff-merge-resonance-seance.md): merging The Resonance and The Séance; merged and live.
