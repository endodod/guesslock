# Addendum Prompt: GUESSLOCK — The Séance (Hero Grouping Puzzle)

> Extends `guesslock-build-prompt.md`, `guesslock-design-prompt.md`, `guesslock-addendum-emoji-quote.md`, `guesslock-addendum-omens.md` and `guesslock-addendum-resonance.md`. Everything in those still applies. This file adds **The Séance**: 16 heroes on the table, 4 hidden groups of 4, in the style of NYT *Connections* and Champdle's *Quadra*. Where this file conflicts with the others, this file wins (including the "only The Measure can be lost" rule: Séance tables can be lost).

## 1. Summary

- New lock **The Séance** — *"Sort 16 heroes into 4 hidden groups."*
- Every day it has **four tables**, each a separate board: **Mechanics**, **Visuals**, **Lore** and **Mixed**.
- Players select 4 heroes and submit. A correct group locks in; a wrong one costs a lockpick. 4 mistakes lose the table.
- Groups come from a **category library**:
  - mechanics categories are derived from the API, then reviewed
  - visual and lore categories are curated by hand
- The generator builds boards with deliberate red herrings, but **exactly one valid solution** (§5).
- Numbering: The Séance is **XVIII**, in its own row below The Omens (after The Resonance renumbers the Shop and the Omens). Numerals live in `locks.config.ts`; local data is keyed by slug.

## 2. How the four tables map to the engine

Model the tables as **four internal locks** that share **one Vault box**:

| Slug | Table |
|---|---|
| `seance-mechanics` | Mechanics |
| `seance-visuals` | Visuals |
| `seance-lore` | Lore |
| `seance-mixed` | Mixed |

- Each is a normal `DailyPuzzle` row (one frozen payload per table per day), so the existing daily engine, archive, stateless `/api/play`, accounts and leaderboards work unchanged.
- In `locks.config.ts`, add a `box: "seance"` field so the Vault renders the four as one box and the lock screen as four tabs.
- **The Séance box** counts as one lock in "x / N locks open". It's "opened" when all four tables are finished (won or lost).

## 3. Category library

A **category** is a set over **all active heroes**. It is not a list of four examples.

```
Category {
  id, type: "mechanics" | "visuals" | "lore",
  label,            // shown after the group is solved, e.g. "Can heal their allies"
  explanation?,     // one short line shown in the results, e.g. "Each has an ability that restores ally HP."
  source: "api" | "derived" | "curated",
  difficulty: 1..4, // admin estimate; 1 = obvious, 4 = devious
  status: "draft" | "approved" | "retired",
  updatedAt
}
CategoryMembership { categoryId, heroId, member: boolean, source: "api" | "derived" | "admin" }
```

**Completeness rule (critical for fairness):** a category is usable only when **every active hero** has an explicit yes/no membership. If a new hero is added by the sync, every category gets an "unknown" for that hero. Those categories drop out of generation and into the review queue until the admin classifies the hero. Without this rule, a hero who truly fits a category but wasn't listed would make a correct guess count as wrong.

### Mechanics: from the API (researched 2026-09-30, verify before use)

Reliable, player-facing groupings available from `/v1/assets/heroes` and `/v1/assets/items`:

| Category idea | Source | Members in snapshot |
|---|---|---|
| Archetype: Marksman / Mystic / Brawler / Assassin | `hero_type` | 8–12 each |
| Weapon type: Rapid Fire, Burst Fire, Spreadshot, Pistol, … | `gun_tag` | 5–8 each |
| Complexity 1 / 2 / 3 stars | `complexity` | ~8–11 each |
| Has an ability that heals allies | ability `behaviours` contains `CAN_HEAL_PLAYERS` | 4 (McGinnis, Dynamo, Kelvin, Viscous) |
| Has an ability with multiple charges | ability property `AbilityCharges` > 1 | 9 |
| Has an ability that stuns | ability properties named `*Stun*` with a value | ~10 (needs review) |
| Shared hero tags, e.g. "Initiator" | hero `tags` shared by ≥ 4 heroes | "Initiator": 4 |

- Most raw ability `behaviours` are **engine internals** (`PREVENT_BOT_USAGE`, `CLEAVE_DISABLED`, `EXCLUSIVE_USE`, …) and mean nothing to players. **Never generate categories from them automatically.**
  - Keep an **allowlist** of player-facing traits in config: `CAN_HEAL_PLAYERS`, projectile-type, self-cast, …
  - Every derived category starts as `draft` and needs admin approval.
- Numeric stats (base health, DPS) only qualify as a category with a clear, stable cut, e.g. "Base health ≥ X". Recompute the members on every sync, and flag the category if its membership changes.
- API-derived memberships **update automatically** after a sync. A change flags the category for review, but doesn't un-approve it unless a member count drops below 4.

### Visuals and Lore: curated

There's no API data for these. They're written by the admin in a category editor. Examples of the *kind* of category (not a list to ship):
- **Visuals:** "Wears a hat", "Glowing eyes", "Not human", "Carries a blade", "Masked".
- **Lore:** "Member of the OSIC", "Came back from death", "Not from this plane", "Works in law enforcement".

**Don't invent game facts.** Curated categories ship only after the admin approves them. The editor shows each hero's portrait (for visuals) or lore text (for lore) next to the yes/no toggle, so the admin can verify every membership. Seed the library with drafts only; an empty approved library means the table stays **Sealed** (like The Cipher without emoji sets).

## 4. Tables

| Table | Draws categories from |
|---|---|
| Mechanics | `mechanics` only |
| Visuals | `visuals` only |
| Lore | `lore` only |
| Mixed | at least 3 different types among its 4 categories |

A table is sealed for the day if its type can't produce a valid board (§5).

## 5. Board generation (per table, seeded, frozen)

1. **Pick 4 categories:** seeded, approved, complete, each with ≥ 4 members.
   - No category repeats within **14 days** in the same table.
   - Prefer a spread of difficulty (ideally one each of 1–4).
2. **Pick 4 heroes per category**, 16 distinct heroes in total.
3. **Uniqueness check:** a solver enumerates every way to split the 16 heroes into the 4 chosen categories. Each hero is assigned to a category it's a member of, and each category gets exactly 4. Require **exactly one** solution; otherwise retry (up to N attempts, then seal the table).
4. **Red herrings:** count the displayed heroes that are members of a chosen category they **don't** belong to in the solution. Require **2–5** red herrings. That makes boards interesting but keeps them fair, since the solution is still unique.
5. **Difficulty colors:** rank the 4 groups by `difficulty` plus a red-herring bonus, and assign the colors in order:

| Rank | Color | Share emoji |
|---|---|---|
| 1 (easiest) | `--brass` | 🟨 |
| 2 | `--ecto` | 🟩 |
| 3 | sapphire (new token, colorblind-safe variant required) | 🟦 |
| 4 (hardest) | `--cursed` | 🟪 |

6. **Freeze the payload:** 16 hero IDs in a seeded display order, and the 4 groups (category ID, label, explanation, color, members). The groups are secret until solved.

## 6. Gameplay & scoring

- The board shows **16 hero tiles**: portrait **and name**, since this mode tests knowledge, not face recognition.
- The player selects exactly 4 tiles, then **Submit**. Other controls: **Shuffle** and **Deselect all**.
- The server checks every submission (stateless, like the other modes). The client never receives memberships of unsolved groups. Outcomes:
  - **Correct:** the group collapses into a colored band at the top with its label and four portraits.
  - **One away:** 3 of the 4 belong to one group. Show "One away…". It still counts as a mistake.
  - **Wrong:** a lockpick snaps.
  - **Repeated submission** of the same 4 is rejected without a penalty.
- **4 lockpicks** (mistakes). The 4th mistake loses the table: the remaining groups are revealed in color order, with a short delay between them.
- **Optional hint** (respects the "no hints" hard-mode setting): after 2 mistakes, **"Reveal a category name"** shows the easiest unsolved group's label. It costs 15 souls, like other hints.
- **Souls per table:**
  - Win: `100 − 20 × mistakes − 15 × hints` (min 20).
  - Loss: `10 × groups found`.
  - The Séance box's souls = the rounded **average** of the four tables, so the box is worth at most 100 like every other lock. Leaderboards use the same value.
- **After finishing a table:** all four groups are shown with labels and explanations.

## 7. UI & design

- **Name:** The Séance. **Plain subtitle:** "Sort 16 heroes into 4 hidden groups."
- **Vault:** its own row below The Omens, with one **wide box** (full row width on desktop, 2 columns on mobile).
  - The door shows four small wax seals, one per table. A seal breaks when its table is finished (ecto when won, velvet when lost).
  - Box states: Locked / In progress (any table started) / Opened (all four finished, with souls) / Sealed (all four tables sealed).
- **Lock screen:**
  - **Tabs:** Mechanics · Visuals · Lore · Mixed, each with its seal state. The last unfinished tab opens by default.
  - **Board:** a 4 × 4 grid of hero tiles on a velvet "séance table" inside a deco frame. Selected tiles lift slightly with an `--ecto` rim.
  - **Solved groups:** stacked bands above the grid in their difficulty color, with the label in small caps.
  - **Mistakes:** the existing `LockpickRow` with 4 picks.
  - **Mobile (360 px):** 4 × 4 grid with ~80 px tiles; names below in 12–13 px; action buttons in a sticky bottom bar. Tap targets stay ≥ 44 px (the whole tile is the target).
- **Motion:** tiles slide into their group band on a correct submission (≈350 ms), and shake gently on a mistake. With reduced motion, use fades only.
- **Colorblind mode:** the group colors switch to the colorblind palette, and every band also shows its rank as a numeral (I–IV), so color is never the only cue.

### Share (per table, spoiler-free, Connections style)

```
GUESSLOCK #142 — The Séance · Lore
🟨🟨🟨🟨
🟩🟦🟩🟩
🟩🟩🟩🟩
🟦🟦🟦🟦
🟪🟪🟪🟪
1 mistake · 80 souls
guesslock.paulkuehn.ch
```

Each row is one submission; each emoji is the true group color of the selected hero. The combined daily share gets a line `Séance   ✨🔓🔒✨` (one symbol per table: ✨ = no mistakes, 🔓 = won with mistakes, 🔒 = lost).

## 8. Admin additions

- **Category editor** (`/admin/categories`):
  - List by type and status. Each category has a membership grid of all active heroes with yes/no toggles.
  - Visuals: portraits in the grid. Lore: lore snippets on hover.
  - Shows the member count, difficulty, the last time it was used, and **completeness** (unknown memberships highlighted).
- **Derived-category review:** API-derived drafts with their members, approve/reject. Membership changes after a sync are shown as a diff.
- **Board preview:** generate a board for any date/table and show the solution, red herrings, and each group's difficulty. The usual calendar override applies.
- **Review queue:** incomplete categories (e.g. after a new hero), derived categories whose membership changed, and tables that sealed because no valid board existed.

## 9. Phase 2 (not now): community boards

Champdle has a community hub for player-made boards, and `todo.md` lists "community puzzles". Keep the data model ready for it:
- Boards get a `source: "daily" | "community"` field and an optional `authorUserId` (accounts exist).
- A community board would use a player's own four categories. It skips the global library and runs the same uniqueness solver.
- It needs moderation (report/hide) before launch. Don't build it now.

## 10. Tests

- **Solver:** counts solutions correctly on hand-made fixtures (0, 1 and several solutions). Generated boards always have exactly 1.
- **Red herrings:** generated boards stay within 2–5, and the difficulty ranking is deterministic per seed.
- **Completeness:** categories with any unknown membership are never used. Adding a hero in a fixture sync makes every category incomplete until it's classified.
- **Allowlist:** no category is ever derived from a non-allowlisted behaviour flag.
- **Server checks:** correct / one away / wrong / repeat, 4-mistake loss, and that unsolved group memberships never appear in any response.
- **Scoring:** win/loss formulas, the hint penalty, and the Séance box average.
- **Share:** the per-table grid matches the submission history and contains no labels or names.
