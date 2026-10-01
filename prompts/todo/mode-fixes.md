# Mode Fixes (from playtest findings)

> Status: all implemented on `feature/mode-findings`; notes after items list caveats.

> Source: `my_findings.md`. Hard-mode ideas live in [`hard-mode.md`](hard-mode.md); do not implement them here.
> Mark an item `[x]` with the commit when it is done.

## General (all modes)

- [x] Win copy: change "Opened in 7. 10 souls" to "Opened in 7 tries. You gain 10 souls".
- [x] Show a correct-answer popup so a win is noticed immediately.
- [x] Guess search ordering: match hero/ability/item *name* first, then secondary matches below (item buffs, ability effects, etc.). Example: searching "unstopp" lists every item that grants Unstoppable.

## The Reckoning

- [x] Add a release date category. Already a column (`release`) but curated: it only shows once every hero has a release date, so fill them in /admin/categories.
- [x] Split the DPS category into two: damage and fire rate. Bullet damage + Fire rate (shots/s); fire rate needs a sync.
- [-] Add a damage type category. Removed again: the game data has no reliable spirit/gun signal (nearly every ability scales with Spirit). Needs a curated source if wanted.

## The Visage

- [x] Remove both hints; the zoom-out is enough.

## The Sigil

- [x] Remove the gap between tiles so only the image shows where tiles are already gone.

## The Belongings

- [x] Focus on the core items per build, the ones that define it, and state this in the clue.
- [x] Add an ability level path as a clue. From deadlock-api ability-order-stats at generation time; left out when the API has nothing.

## The Echo

- [x] For each voice line, show who the hero is talking to. Taken from the wiki section the line was imported under (a hero name or "To <hero>"); otherwise shows "To no one in particular". Verify against real section names in /admin.

## The Appraisal

- [x] Rework the stat-bonus category to name the buffs (e.g. bullet velocity, or none).
- [x] Split into two categories: primary buffs and secondary buffs.

## The Measure

- [x] Redesign the bar next to the item display so it looks better.

## The Clash

- [x] Show dead heroes as dead (currently assumed to be drawn outside the map).
- [x] Extend the scenario to the next 20 s; the player may watch the first 10 s of the sequence. New scenarios use a 20 s window; already harvested ones keep 30 s. An OmenConfig tuning override with clashWindow would win over the new default.
- [x] Add a slider to shrink the hero icons on the map.

## The Beast

- [x] Same changes as The Clash (dead heroes, 20 s window with 10 s preview, icon-size slider). Beast window stays 60 s (the kill is 30-50 s in); preview is 10 s.
- [x] Only pick scenarios where the midboss is killed within the next 60 s; remove question one.
- [x] Questions become: who kills it, and how many each team gets.

## The Rift

- [x] Same changes as The Clash.
- [x] Add a rift icon so the player can see which lane it starts in.

## Not in findings (no change requested)

The Testament, The Incantation, The Ascension, The Relic: only hard-mode notes, see `hard-mode.md`.

## Second round (findings: bonus questions, select lines, Colloquy)

- [x] No bonus question when its answer was already shown during the game (play.ts checks the clue and the guess rows).
- [x] A bonus question for every puzzle that can have one: heroes "Which of these is X's ultimate?", The Ascension "Which slot is X?", items "How much does X cost?". The Sigil, Incantation, Utterance and Resonance keep "Name the ability". The Measure, the Omens and the Séance have none.
- [x] Guess the hero from the printed select lines: this is The Echo (IX), no audio.
- [x] The Colloquy reveals in bites (a question and its answer, each hero speaking once), at the start and after every wrong guess.
