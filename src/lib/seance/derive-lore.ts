// The Séance, lore tables: groups about who the heroes are and where they come from.
// Three sources: text matches on the API lore (the label says "lore mentions ..."), release waves (from the wiki's
// release dates) and a hand-written tag table read from the official lore texts (src/lib/seance/curated.ts).
import type { Normalized } from "../deadlock/normalize";
import { normalize } from "../text/normalize";
import { fromTags, type TagDef } from "./curated";
import type { DerivedCategory } from "./derive";

/** Release dates from the Deadlock Wiki's hero infoboxes (heroes added later stay unknown until an admin sets them). */
export const HERO_RELEASE: Record<string, string> = {
  Abrams: "2024-04-24", Seven: "2024-04-24", Vindicta: "2024-04-24", "Grey Talon": "2024-04-24", Haze: "2024-04-24", Warden: "2024-04-24",
  Lash: "2024-04-24", Pocket: "2024-04-24", Wraith: "2024-04-24", Infernus: "2024-04-24", McGinnis: "2024-04-24", Kelvin: "2024-04-24",
  "Mo & Krill": "2024-04-24", Ivy: "2024-04-24", Dynamo: "2024-04-24", "Lady Geist": "2024-04-24", Paradox: "2024-04-24", Bebop: "2024-04-24",
  Yamato: "2024-04-24", Viscous: "2024-08-01", Shiv: "2024-08-15", Mirage: "2024-09-26", Calico: "2025-01-17", Holliday: "2025-01-17",
  Vyper: "2025-01-17", Sinclair: "2025-01-17", Mina: "2025-08-18", Billy: "2025-08-20", "The Doorman": "2025-08-22", Paige: "2025-08-25",
  Drifter: "2025-08-27", Victor: "2025-08-29", Graves: "2026-01-29", Rem: "2026-01-26", Silver: "2026-02-02", Venator: "2026-02-05",
  Celeste: "2026-02-09", Apollo: "2026-02-12", "Rat King": "2026-10-02",
};

/** Yamato's lore is written in Japanese in the API: a short English summary for the text matches. */
const LORE_EN: Record<string, string> = {
  Yamato: "Born into the family of a crime boss, Karin and her brother Yamato were to inherit the Seventh Moon crime organization after their father died. Yamato died protecting his sister in a violent rebellion and she fled with a few loyal followers from Japan to America.",
};

const TEXT_GROUPS: { tag: string; label: string; explanation: string; difficulty: number; re: RegExp }[] = [
  {
    tag: "nyc", label: "Lore mentions New York", difficulty: 2, re: /new york|manhattan|coney island|boroughs|central park|tri-state|cursed apple/i,
    explanation: "Their official lore text mentions New York, Manhattan, Coney Island or the five boroughs.",
  },
  {
    tag: "family", label: "Lore mentions family", difficulty: 2,
    re: /\b(father|mother|parents?|brother|sister|son|daughter|wife|husband|family|families|heir|kid|child|children|aunt|uncle|dad|mom)\b/i,
    explanation: "Their official lore text mentions a parent, sibling, child, spouse or family.",
  },
];

/** What each hero is, from their lore text. Heroes not listed under a tag are a clear "no". */
export const LORE_TAGS: TagDef[] = [
  { tag: "hunters", label: "Monster hunters", explanation: "Each hunts monsters: the Baxter Society or the Vatican's order of Venators.", difficulty: 2, members: ["Calico", "Grey Talon", "Shiv", "Venator"] },
  { tag: "scientists", label: "Scientists and inventors", explanation: "Each is a scientist, professor or inventor.", difficulty: 2, members: ["McGinnis", "Dynamo", "Kelvin", "Seven"] },
  { tag: "criminals", label: "Criminals", explanation: "Each has a criminal career or past: gangs, heists, arson or contract killing.", difficulty: 2, members: ["Wraith", "Paradox", "Mo & Krill", "Yamato", "Vyper", "Infernus", "Calico", "Shiv"] },
  { tag: "undead", label: "Dead, undead or ghost", explanation: "Each is a ghost, a vampire, or came back from death.", difficulty: 2, members: ["Vindicta", "Seven", "Kelvin", "Victor", "Drifter", "Mina", "Sinclair"] },
  { tag: "nothuman", label: "Not born human", explanation: "Each is a creature, spirit or being that was not born a regular human.", difficulty: 2, members: ["Infernus", "Abrams", "Apollo", "Vyper", "Mo & Krill", "Ivy", "Silver", "Celeste", "Viscous", "Rem", "Bebop", "The Doorman", "Drifter", "Mina", "Rat King"] },
  { tag: "folklore", label: "Folklore creatures", explanation: "Each is a creature from myth or folklore: golem, gargoyle, gorgon, werewolf, unicorn, vampire or a made man.", difficulty: 3, members: ["Bebop", "Ivy", "Vyper", "Silver", "Celeste", "Drifter", "Mina", "Victor"] },
  { tag: "hired", label: "Works for pay", explanation: "Each fights for money: bounty hunter, hired killer, bodyguard or paid brawler.", difficulty: 3, members: ["Silver", "Calico", "Mirage", "Bebop"] },
  { tag: "magic", label: "Practise magic", explanation: "Each practises magic, alchemy, witchcraft or necromancy.", difficulty: 3, members: ["Paige", "Warden", "Graves", "Vindicta", "Lady Geist", "Sinclair"] },
  { tag: "fame", label: "Wealth or fame", explanation: "Each comes from money or is famous in their world.", difficulty: 3, members: ["Lady Geist", "Celeste", "Mina", "Pocket"] },
  { tag: "partner", label: "Fights with a partner or companion", explanation: "Each fights alongside a partner, pet or companions.", difficulty: 3, members: ["Calico", "Mo & Krill", "Sinclair", "Rem", "Ivy", "Rat King"] },
  { tag: "fullname", label: "Real name given in their lore", explanation: "Their lore names the person behind the title: Wesley, Jacob, Maggie, Lilah, Darcy, Mina Ha, Arin, Henry, Jeanne, Karin or Louis.", difficulty: 4, members: ["Grey Talon", "Lash", "McGinnis", "Silver", "Graves", "Mina", "Pocket", "Sinclair", "Lady Geist", "Yamato", "Rat King"] },
  { tag: "died", label: "Died in their backstory", explanation: "Each died, or was left for dead, in their own backstory.", difficulty: 4, members: ["Vindicta", "Seven", "Kelvin", "Pocket", "Yamato", "Victor", "Sinclair"] },
];

type WaveDef = { tag: string; label: string; explanation: string; difficulty: number; from: string; to: string };
const WAVES: WaveDef[] = [
  { tag: "wave:launch", label: "In the game from the start", explanation: "Each was playable on 24 April 2024.", difficulty: 2, from: "2024-04-24", to: "2024-04-24" },
  { tag: "wave:2024", label: "Added late 2024 or January 2025", explanation: "Each was released between August 2024 and January 2025.", difficulty: 3, from: "2024-08-01", to: "2025-01-31" },
  { tag: "wave:jan25", label: "Joined in January 2025", explanation: "Each was released on 17 January 2025.", difficulty: 3, from: "2025-01-17", to: "2025-01-17" },
  { tag: "wave:aug25", label: "Joined in August 2025", explanation: "Each was released in August 2025.", difficulty: 3, from: "2025-08-01", to: "2025-08-31" },
  { tag: "wave:2026", label: "Joined in 2026", explanation: "Each was released in 2026.", difficulty: 3, from: "2026-01-01", to: "2026-12-31" },
];

export function deriveHeroLore(heroesRaw: unknown[], norm: Pick<Normalized, "heroes">): DerivedCategory[] {
  const heroes = norm.heroes;
  const loreOf = new Map((heroesRaw as { id: number; description?: { lore?: string | null } | null }[]).map((h) => [h.id, h.description?.lore ?? ""]));
  const out: DerivedCategory[] = [];
  const text = (h: { id: number; name: string }) => (LORE_EN[h.name] ?? loreOf.get(h.id) ?? "").replace(/<[^>]*>/g, " ");

  for (const g of TEXT_GROUPS)
    out.push({
      key: `hero:lore:${g.tag}`, entity: "hero", type: "lore", label: g.label, explanation: g.explanation, source: "derived", difficulty: g.difficulty, vetted: true,
      members: new Map(heroes.map((h) => [h.id, text(h) ? g.re.test(text(h)) : null])),
    });

  const universe = heroes.map((h) => ({ id: h.id, key: h.name }));
  const reviewed = new Set(Object.keys(HERO_RELEASE));
  out.push(...fromTags("hero", "lore", LORE_TAGS, universe, reviewed));
  for (const w of WAVES)
    out.push({
      key: `hero:lore:${w.tag}`, entity: "hero", type: "lore", label: w.label, explanation: w.explanation, source: "derived", difficulty: w.difficulty, vetted: true,
      members: new Map(heroes.map((h) => { const d = HERO_RELEASE[h.name]; return [h.id, d ? d >= w.from && d <= w.to : null]; })),
    });
  return out;
}

/** Normalised names of every hero the lore table was written for (used by the tests). */
export const LORE_REVIEWED = new Set(Object.keys(HERO_RELEASE).map(normalize));
