// Extra Lexicon words from the Deadlock world that aren't hero, item or ability names: game terms, places, teams and
// unreleased heroes. Each one was checked against its page on deadlock.wiki (October 2026). `name` is how the reveal
// writes it; `note` says what it is.
export type LoreWord = { word: string; name: string; note: string };

export const LORE_WORDS: LoreWord[] = [
  { word: "SOULS", name: "Souls", note: "The currency and experience of every match" },
  { word: "BOONS", name: "Boons", note: "Power levels earned by gathering souls" },
  { word: "BRAWL", name: "Street Brawl", note: "The fast 4v4 game mode" },
  { word: "HAUNT", name: "Haunts", note: "Neutral creeps, a second source of souls" },
  { word: "RUNES", name: "Runes", note: "The powerups that spawn on the bridges" },
  { word: "REJUV", name: "Rejuvenator", note: "The green crystal the Midboss leaves behind" },
  { word: "ROPES", name: "Ropes", note: "Climbable ropes around the map" },
  { word: "SLIDE", name: "Sliding", note: "The movement that keeps your momentum" },
  { word: "PARRY", name: "Parry", note: "The answer to a heavy melee attack" },
  { word: "SNACK", name: "Healing Snack", note: "Healing pickups found around the map" },
  { word: "VAULT", name: "Sinner's Sacrifice", note: "The soul vaults broken open with melee" },
  { word: "IMBUE", name: "Imbued items", note: "Items whose effect goes onto one ability" },
  { word: "AMBER", name: "The Amber Hand", note: "The Hidden King's team" },
  { word: "APPLE", name: "The Cursed Apple", note: "The map every match is played on" },
  { word: "LANES", name: "Lanes", note: "The lanes of the Cursed Apple" },
  { word: "SEWER", name: "Sewers", note: "The tunnels under the city, home of the Rat King" },
  { word: "VENTS", name: "Vents", note: "Shortcuts only some heroes fit through" },
  { word: "VALVE", name: "Valve", note: "The studio making Deadlock" },
  { word: "RAVEN", name: "Raven", note: "An unreleased hero, a Russian operative" },
  { word: "DRUID", name: "Druid", note: "An unreleased hero" },
  { word: "SLORK", name: "Fathom", note: "Slork, an unreleased hero once in Hero Labs" },
  { word: "DANNY", name: "Deadman Danny", note: "An unreleased hero" },
  { word: "JACOB", name: "Lash", note: "His full name is Jacob Lash" },
];
