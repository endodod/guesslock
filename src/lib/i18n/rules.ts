// Plain-language rules for every lock (no themed jargon). Used by the rules popover and /how-to-play.
export const RULES: Record<string, string> = {
  reckoning: "Guess any hero. Each guess shows how its gender, species, complexity, weapon type, health, gun DPS and release date compare to the answer. Green is a match, orange is a partial match, red is no match. Arrows show whether the answer's number or date is higher or lower. Unlimited guesses.",
  visage: "A heavily zoomed-in piece of a hero's portrait is shown. Each wrong guess zooms out one step. Hints unlock after 4 and 6 wrong guesses. Unlimited guesses.",
  sigil: "An ability icon is hidden under tiles. Each wrong guess removes a tile. Guess which hero owns the ability. After you win, a bonus round asks you to name the ability.",
  testament: "A hero's lore is shown with names blacked out, one part at a time. Each wrong guess reveals the next part. Gender is revealed after 4 wrong guesses, species after 7.",
  incantation: "An ability description is shown with names blacked out. Guess the hero it belongs to. After 3 wrong guesses you see which slot the ability is in; after 6, a blurred icon. Bonus round: name the ability.",
  belongings: "Items that are unusually popular on one hero are shown, starting with the least telling one. Each wrong guess adds another item. Guess the hero.",
  ascension: "The upgrade texts of one ability are shown, starting with Tier III. Wrong guesses reveal Tier II, then Tier I, then a blurred icon. Guess the ability; the list is grouped by hero.",
  cipher: "Six emojis describe a hero. You start with one; each wrong guess reveals the next. After all six are shown, 2 more wrong guesses reveal the gender and 2 more the first letter.",
  echo: "Voice lines spoken by one hero are shown with names blacked out. You start with one line; each wrong guess adds another, up to five. After that, 2 more wrong guesses reveal the hero's gender.",
  relic: "An item's icon is shown blurred. Each wrong guess makes it sharper. Hints unlock after 4 and 6 wrong guesses.",
  appraisal: "Guess any item. Each guess shows how its slot, tier, type, components, cooldown and number of stat bonuses compare to the answer. Arrows show whether the answer's value is higher or lower.",
  lineage: "One item is shown along with its build path direction. Guess the item on the other side: either what it builds into, or its component. If several items fit, any of them counts. The slot color of the answer is shown from the start.",
  measure: "An item's stat card is shown with one value hidden. Guess the number: each guess tells you whether the real value is higher or lower. You have 5 tries. Guesses within 10% of the value (at least 1 unit) count as correct.",
};
