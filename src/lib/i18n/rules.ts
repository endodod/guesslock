// Plain-language rules for every lock (no themed jargon). Used by the rules popover and /how-to-play.
// The hint sentence is added from locks.config.ts, so it always matches the real unlock points.
import { LOCK_BY_SLUG } from "@/locks.config";

/** The sorting puzzles share their rules; only the tiles and the four tables differ. */
function seanceRules(noun: string, tables: string, box: string): string {
  return `16 ${noun} sit on the table, in 4 hidden groups of 4. Each group shares something. Select 4 ${noun} and submit. A correct group locks in and shows its name; a wrong pick snaps a lockpick. "One away" means 3 of your 4 belong together (still a mistake). Picking the same 4 twice doesn't count. 4 mistakes lose the table. Every group fits exactly one way, so watch for ${noun} that seem to fit two groups. There are four tables a day: ${tables}. A solved table is worth 100 souls, minus 20 per mistake (at least 20); a lost table 10 per group found. ${box} is worth the average of its tables.`;
}

const BASE: Record<string, string> = {
  reckoning: "Guess any hero. Each guess shows how its attributes (gender, archetype, species, complexity, weapon, health, bullet damage, fire rate, release date and more) compare to the answer. Green is a match, orange is a partial match, red is no match. Arrows show whether the answer's number or date is higher or lower. Unlimited guesses.",
  visage: "A heavily zoomed-in piece of a hero's portrait is shown. Each wrong guess zooms out one step. Unlimited guesses.",
  sigil: "An ability icon is hidden under tiles. Each wrong guess removes a tile. Guess which hero owns the ability. After you win, a bonus round asks you to name the ability.",
  testament: "A hero's lore is shown with names blacked out, one part at a time. Each wrong guess reveals the next part.",
  incantation: "An ability description is shown with names blacked out. Guess the hero it belongs to. Bonus round: name the ability.",
  belongings: "The core items that define one hero's build (bought a lot, and far more than on other heroes) are shown, starting with the least telling one, along with the order the hero's ability points are spent. Each wrong guess adds another item. Guess the hero.",
  ascension: "The upgrade texts of one ability are shown, starting with Tier III. Wrong guesses reveal Tier II, then Tier I, then a blurred icon. Guess the ability; the list is grouped by hero.",
  cipher: "Five emojis describe a hero, picked from a set of ten, so the same hero looks different each time. You start with one; each wrong guess reveals the next, from the hardest to the most obvious.",
  echo: "The hero's lines from the character-select screen, with names blacked out. You start with one line; each wrong guess adds another, up to five.",
  utterance: "What one hero says when casting one of their abilities, with names blacked out. The ability slot (1, 2, 3 or Ultimate) is shown. You start with one line; each wrong guess adds another, up to five. After you win, a bonus round asks you to name the ability.",
  colloquy: "A complete conversation between two heroes, with names blacked out. You see which hero the other speaker is; your answer is the one marked ?. You start with the first line; each wrong guess reveals the next.",
  resonance: "This lock needs sound. Play the cast sound of one hero's ability, whose slot (1, 2, 3 or Ultimate) is shown, and guess the hero. You hear it as it is; after 1 wrong guess a second cast sound of the same ability, after 2 a third. Sounds never play on their own and replays are free. After you win, a bonus round asks you to name the ability. Can't use sound? Turn on Skip sound locks in Settings.",
  relic: "An item's icon is shown blurred. Each wrong guess makes it sharper.",
  appraisal: "Guess any item. Each guess shows how its slot, type, components, cooldown, primary buff and secondary buffs (such as bullet velocity, or none) compare to the answer. Arrows show whether the answer's value is higher or lower.",
  lineage: "One item is shown along with its build path direction. Guess the item on the other side: either what it builds into, or its component. If several items fit, any of them counts. The slot color of the answer is shown from the start.",
  clash: "A frozen moment from a real high-rank match: every hero's position, exact HP, level, net worth, items and ultimate. You can watch the first 10 seconds, then predict the next 20 seconds in total: does anyone die, how many per team, and who. Dead heroes show as skulls where they fell; the Icons slider shrinks the hero icons. Answer everything, then lock in; the match plays out on the map. Up to 100 souls: 20 for yes/no, 15 per team count (7 if off by one), 50 for picking the right heroes (wrong picks cost points).",
  beast: "A real high-rank match, shortly before the midboss is killed. You can watch the first 10 seconds. The midboss falls within the next 60: which team kills it, and how many rejuvs does each team have afterwards? Up to 100 souls: 40 for the killer, 30 per team count (15 if off by one).",
  rift: "A real high-rank match just before the Unstable Rift opens; its icon on the map shows the lane it opens in, and you can watch the first 10 seconds. Predict which team claims it (or nobody, if it expires) and how many heroes die at the rift per team. Up to 100 souls: 50 for the claimer, 25 per team count (12 if off by one).",
  seance: seanceRules("heroes", "Mechanics, Visuals, Lore and Mixed", "The Séance"),
  bazaar: seanceRules("items", "Stats, Effects, Looks and Mixed", "The Bazaar"),
  grimoire: seanceRules("abilities", "Mechanics, Effects, Looks and Mixed", "The Grimoire"),
  shadow: "A hero's silhouette is shown, zoomed in. Each wrong guess zooms out one step until the whole shape is visible; the portrait itself only appears once the lock is finished. Hard mode stays zoomed in. Unlimited guesses.",
  arsenal: "The silhouette of one hero's weapon is shown, zoomed in. Each wrong guess zooms out; after 4 wrong guesses the weapon is shown in colour. Hard mode stays zoomed in and never shows the colour. Unlimited guesses.",
  calculus: "All four of a hero's abilities are shown by their numbers: the stats on each in-game card, with cooldown, cast range, duration and charges where they have them. Guess the hero. The first letter of their name unlocks after 4 wrong guesses, the first two after 6. Hard mode leaves one stat of each ability out. Unlimited guesses.",
  decoy: "Eight items from one hero's core build, but one of them is a fake: an item that hero almost never buys (under 1% of their matches) although it is common on other heroes. Tap the fake. You have 3 picks: 100 souls on the first, 50 on the second, 25 on the third. Hard mode doesn't say whose build it is.",
  cache: "One team of a real high-rank match and the six inventories they ended the match with, with each player's net worth. Give every inventory a hero and submit; matched inventories lock in and stay. You have 4 submissions: 100 souls on the first, then 75, 50 and 25. Hard mode leaves some items blank and hides the net worth.",
  constellation: "A 3 by 3 grid: every row and every column is a category. Fill each cell with a hero who fits both its row and its column. Type the hero's name yourself (there are no suggestions); each hero can be used once. A wrong hero snaps one of your 4 lockpicks; a filled cell is final. 10 souls per filled cell, plus 10 for a full grid, also when the lock jams.",
  measure: "An item's stat card is shown with one value hidden. Guess the number: each guess tells you whether the real value is higher or lower. You have 5 tries. Guesses within 10% of the value (at least 1 unit) count as correct.",
};

function hintSentence(slug: string): string {
  const [first, second] = LOCK_BY_SLUG[slug]?.hints ?? [];
  if (!first || !second) return "";
  return ` The answer's first letter unlocks after ${first.after} wrong guesses, its first two letters after ${second.after}.`;
}

export const RULES: Record<string, string> = Object.fromEntries(Object.entries(BASE).map(([slug, text]) => [slug, text + hintSentence(slug)]));
