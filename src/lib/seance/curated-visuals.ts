// Looks: hand-written groups about how heroes, items and abilities look (portraits and icons), plus the one the
// API can tell (hero gender). Written from a review of every hero portrait, item icon and ability icon:
// each entity was looked at, so an entity without a tag is a clear "no".
import type { Normalized } from "../deadlock/normalize";
import { fromTags, type TagDef } from "./curated";
import { bazaarItems } from "./derive-items";
import type { DerivedCategory } from "./derive";
import { ABILITY_LOOKS, ABILITY_LOOKS_REVIEWED, ITEM_LOOKS, ITEM_LOOKS_REVIEWED } from "./curated-looks";

/** Hero portraits (the card art): keys are hero names. */
export const HERO_LOOKS: TagDef[] = [
  { tag: "hat", label: "Wears a hat or cap", explanation: "Each portrait shows a hat, a cap or a helmet-like hat.", difficulty: 1, members: ["Infernus", "Wraith", "Holliday", "Sinclair", "Drifter", "Mo & Krill", "Ivy", "The Doorman", "Rem", "Warden"] },
  { tag: "glasses", label: "Wears glasses or goggles", explanation: "Each portrait shows glasses, shades or goggles.", difficulty: 2, members: ["Infernus", "Abrams", "Dynamo", "Calico", "Paige"] },
  { tag: "facialhair", label: "Has a beard or mustache", explanation: "Each portrait shows facial hair.", difficulty: 1, members: ["Abrams", "Kelvin", "Shiv", "Warden", "Lash", "Mirage", "Sinclair", "Venator"] },
  { tag: "horns", label: "Has horns", explanation: "Each portrait shows horns (a unicorn horn counts).", difficulty: 2, members: ["Abrams", "Billy", "Apollo", "Celeste"] },
  { tag: "glowing", label: "Has glowing eyes", explanation: "Each portrait shows eyes that glow.", difficulty: 2, members: ["Vindicta", "Haze", "Bebop", "Drifter", "Billy"] },
  { tag: "animal", label: "Has an animal or creature face", explanation: "Each portrait shows a creature or animal face.", difficulty: 2, members: ["Vyper", "Ivy", "Mo & Krill", "Billy", "Rem", "Rat King"] },
  { tag: "faceless", label: "No face shown", explanation: "Each portrait hides the face behind a helmet, dome, blob or shadow.", difficulty: 2, members: ["Seven", "Paradox", "Dynamo", "Bebop", "Viscous", "Haze"] },
  { tag: "longhair", label: "Has long hair", explanation: "Each portrait shows long hair.", difficulty: 2, members: ["Vindicta", "Lady Geist", "Grey Talon", "Victor", "Silver", "Celeste"] },
  { tag: "redhair", label: "Has red or orange hair", explanation: "Each portrait shows red or orange hair.", difficulty: 3, members: ["Kelvin", "Paige", "The Doorman", "McGinnis"] },
  { tag: "skin", label: "Blue, green or red skin", explanation: "Each portrait shows skin in a color humans do not have.", difficulty: 2, members: ["Vindicta", "Abrams", "Grey Talon", "Vyper", "Viscous", "Apollo"] },
  { tag: "red", label: "Wears red", explanation: "Red is a main color of the portrait's clothes.", difficulty: 2, members: ["Infernus", "Drifter", "Apollo", "The Doorman", "McGinnis", "Mina"] },
  { tag: "orange", label: "Wears orange or yellow", explanation: "Orange or yellow is a main color of the portrait's clothes.", difficulty: 2, members: ["Haze", "Grey Talon", "Vyper", "Holliday", "Silver", "Bebop"] },
  { tag: "blue", label: "Wears blue", explanation: "Blue is a main color of the portrait's clothes.", difficulty: 2, members: ["McGinnis", "Rem", "Warden", "Dynamo", "Abrams"] },
  { tag: "purple", label: "Wears purple", explanation: "Purple is a main color of the portrait.", difficulty: 2, members: ["Vindicta", "Yamato", "Mirage", "Sinclair"] },
  { tag: "green", label: "Has green accents", explanation: "Green is a main accent color of the portrait.", difficulty: 3, members: ["Lady Geist", "Dynamo", "Paige", "Viscous", "Vyper"] },
  { tag: "jewelry", label: "Wears earrings or a necklace", explanation: "Each portrait shows an earring, necklace or choker.", difficulty: 3, members: ["Lady Geist", "Calico", "Grey Talon", "Lash", "Victor", "Silver"] },
  { tag: "fangs", label: "Shows fangs", explanation: "Each portrait shows fangs or sharp teeth.", difficulty: 3, members: ["Mina", "Drifter", "Vyper", "Infernus"] },
  { tag: "tie", label: "Wears a tie or bow tie", explanation: "Each portrait shows a tie or a bow tie.", difficulty: 3, members: ["Infernus", "Paradox", "Dynamo", "Sinclair", "Mina"] },
  { tag: "grin", label: "Is grinning", explanation: "Each portrait shows a wide grin or smile.", difficulty: 3, members: ["Drifter", "Vyper", "Celeste", "Mina"] },
];

const HERO_REVIEWED = [
  "Abrams", "Apollo", "Bebop", "Billy", "Calico", "Celeste", "Drifter", "Dynamo", "Graves", "Grey Talon", "Haze", "Holliday", "Infernus", "Ivy", "Kelvin",
  "Lady Geist", "Lash", "McGinnis", "Mina", "Mirage", "Mo & Krill", "Paige", "Paradox", "Pocket", "Rem", "Seven", "Shiv", "Silver", "Sinclair", "The Doorman",
  "Venator", "Victor", "Vindicta", "Viscous", "Vyper", "Warden", "Wraith", "Yamato", "Rat King",
];

export function deriveCuratedVisuals(norm: Pick<Normalized, "heroes" | "items" | "abilities">): DerivedCategory[] {
  const out: DerivedCategory[] = [];
  const heroName = new Map(norm.heroes.map((h) => [h.id, h.name]));

  out.push(...fromTags("hero", "visuals", HERO_LOOKS, norm.heroes.map((h) => ({ id: h.id, key: h.name })), new Set(HERO_REVIEWED)));
  // Gender is in the API (a hero without one, like Sinclair, is neither).
  for (const [g, label] of [["female", "Female heroes"], ["male", "Male heroes"]] as const)
    out.push({
      key: `hero:visuals:gender:${g}`, entity: "hero", type: "visuals", label, explanation: `Each is listed as ${g}.`, source: "api", difficulty: 1, vetted: true,
      members: new Map(norm.heroes.map((h) => [h.id, h.gender === g])),
    });

  out.push(...fromTags("item", "visuals", ITEM_LOOKS, bazaarItems(norm).map((i) => ({ id: i.id, key: i.name })), new Set(ITEM_LOOKS_REVIEWED)));
  out.push(
    ...fromTags(
      "ability", "visuals", ABILITY_LOOKS,
      norm.abilities.map((a) => ({ id: a.id, key: `${heroName.get(a.heroId) ?? "?"}: ${a.name}` })),
      new Set(ABILITY_LOOKS_REVIEWED),
    ),
  );
  return out;
}
