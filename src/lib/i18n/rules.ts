// Plain-language rules for every lock (no themed jargon). Used by the rules popover and /how-to-play.
// The hint sentence is added from locks.config.ts, so it always matches the real unlock points.
import { LOCK_BY_SLUG } from "@/locks.config";

const BASE: Record<string, string> = {
  reckoning: "Guess any hero. Each guess shows how its attributes (gender, archetype, species, complexity, weapon, health, gun DPS, release date and more) compare to the answer. Green is a match, orange is a partial match, red is no match. Arrows show whether the answer's number or date is higher or lower. Unlimited guesses.",
  visage: "A heavily zoomed-in piece of a hero's portrait is shown. Each wrong guess zooms out one step. Unlimited guesses.",
  sigil: "An ability icon is hidden under tiles. Each wrong guess removes a tile. Guess which hero owns the ability. After you win, a bonus round asks you to name the ability.",
  testament: "A hero's lore is shown with names blacked out, one part at a time. Each wrong guess reveals the next part.",
  incantation: "An ability description is shown with names blacked out. Guess the hero it belongs to. Bonus round: name the ability.",
  belongings: "Items that are unusually popular on one hero are shown, starting with the least telling one. Each wrong guess adds another item. Guess the hero.",
  ascension: "The upgrade texts of one ability are shown, starting with Tier III. Wrong guesses reveal Tier II, then Tier I, then a blurred icon. Guess the ability; the list is grouped by hero.",
  cipher: "Five emojis describe a hero, picked from a set of ten, so the same hero looks different each time. You start with one; each wrong guess reveals the next, from the hardest to the most obvious.",
  echo: "Voice lines spoken by one hero are shown with names blacked out. You start with one line; each wrong guess adds another, up to five.",
  resonance: "This lock needs sound. Play the sound of one hero's ability and guess the hero. It starts muffled, as if heard through the vault door; after 1 wrong guess you hear it clearly, after 2 a second sound of the same ability, and after 3 the hero's gun sound. Sounds never play on their own and replays are free. After you win, a bonus round asks you to name the ability. Can't use sound? Turn on Skip sound locks in Settings.",
  relic: "An item's icon is shown blurred. Each wrong guess makes it sharper.",
  appraisal: "Guess any item. Each guess shows how its slot, tier, type, components, cooldown and number of stat bonuses compare to the answer. Arrows show whether the answer's value is higher or lower.",
  lineage: "One item is shown along with its build path direction. Guess the item on the other side: either what it builds into, or its component. If several items fit, any of them counts. The slot color of the answer is shown from the start.",
  clash: "A frozen moment from a real high-rank match: every hero's position, exact HP, level, net worth, items and ultimate. Predict the next 30 seconds: does anyone die, how many per team, and who. Answer everything, then lock in; the match plays out on the map. Up to 100 souls: 20 for yes/no, 15 per team count (7 if off by one), 50 for picking the right heroes (wrong picks cost points).",
  beast: "A real high-rank match, 30 to 60 seconds before something might happen at the midboss. Predict the next 60 seconds: is it killed, by which team, who takes the rejuv (steals happen), and how many rejuvs each team has afterwards. Up to 100 souls.",
  rift: "A real high-rank match just before the Unstable Rift opens. Predict which team claims it (or nobody, if it expires) and how many heroes die at the rift per team. Up to 100 souls: 50 for the claimer, 25 per team count (12 if off by one).",
  seance: "16 heroes sit at the table, in 4 hidden groups of 4. Each group shares something: a mechanic, a look, or a piece of lore. Select 4 heroes and submit. A correct group locks in and shows its name; a wrong pick snaps a lockpick. \"One away\" means 3 of your 4 belong together (still a mistake). Picking the same 4 twice doesn't count. 4 mistakes lose the table. After 2 mistakes you can reveal one group's name for 15 souls. Every group fits exactly one way, so watch for heroes that seem to fit two groups. There are four tables a day: Mechanics, Visuals, Lore and Mixed. A solved table is worth 100 souls, minus 20 per mistake and 15 for the hint (at least 20); a lost table 10 per group found. The Séance box is worth the average of its tables.",
  measure: "An item's stat card is shown with one value hidden. Guess the number: each guess tells you whether the real value is higher or lower. You have 5 tries. Guesses within 10% of the value (at least 1 unit) count as correct.",
};

function hintSentence(slug: string): string {
  const [first, second] = LOCK_BY_SLUG[slug]?.hints ?? [];
  if (!first || !second) return "";
  return ` The answer's first letter unlocks after ${first.after} wrong guesses, its first two letters after ${second.after}.`;
}

export const RULES: Record<string, string> = Object.fromEntries(Object.entries(BASE).map(([slug, text]) => [slug, text + hintSentence(slug)]));
