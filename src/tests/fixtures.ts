// In-memory GameData for mode tests (no DB).
import type { AbilityData, GameData, HeroData, ItemData, SoundData, VoiceEntryData, VoiceLineData } from "@/lib/engine/context";
import type { NormHero } from "@/lib/deadlock/types";
import { HERO_COLUMNS, ITEM_COLUMNS } from "@/lib/engine/columns";

export function hero(id: number, name: string, over: Partial<HeroData> = {}): HeroData {
  const src: NormHero = {
    id, className: `hero_${name.toLowerCase()}`, name, gender: id % 2 ? "male" : "female", heroType: "marksman",
    complexity: 2, gunTag: "Pistol", tags: [], lore: null, role: null, playstyle: null,
    images: { card: `https://x/${id}.png`, small: null, vertical: null }, maxHealth: 700 + id, bulletDamage: 10, dps: 50 + id,
    abilityClassNames: [],
  };
  return {
    id, name, className: src.className, aliases: [], exclude: [], eligible: true, src,
    gender: src.gender, species: "Human", weaponType: "Pistol", releaseDate: "2024-08-01",
    emojis: [], emojisReviewed: false, genericVoice: false, setup: {}, attrs: {}, card: `/media/${id}`, splash: `/media/${id}`, icon: null, ...over,
  };
}

export function makeData(opts: {
  heroes: HeroData[];
  abilities?: AbilityData[];
  items?: ItemData[];
  lines?: Record<number, VoiceLineData[]>;
  /** `${heroId}:${kind}` -> wiki voice entries */
  entries?: Record<string, VoiceEntryData[]>;
  texts?: Record<string, string>;
  /** abilityId -> approved clips */
  sounds?: Record<number, SoundData[]>;
  /** heroId -> approved gun clips */
  guns?: Record<number, SoundData[]>;
  codenames?: Record<number, string[]>;
}): GameData {
  const abilities = opts.abilities ?? [];
  const items = opts.items ?? [];
  return {
    heroes: opts.heroes, abilities, items,
    hero: (id) => opts.heroes.find((h) => h.id === id),
    ability: (id) => abilities.find((a) => a.id === id),
    item: (id) => items.find((i) => i.id === id),
    abilitiesOf: (heroId) => abilities.filter((a) => a.heroId === heroId),
    text: (type, id) => opts.texts?.[`${type}:${id}`] ?? null,
    voiceLines: (heroId) => opts.lines?.[heroId] ?? [],
    voiceEntries: (heroId, kind) => opts.entries?.[`${heroId}:${kind}`] ?? [],
    abilitySounds: (id) => opts.sounds?.[id] ?? [],
    weaponSounds: (heroId) => opts.guns?.[heroId] ?? [],
    soundCodenames: (heroId) => opts.codenames?.[heroId] ?? [],
    buildsInto: (cls) => items.filter((i) => i.src.componentClassNames.includes(cls)).map((i) => i.src),
    itemByClass: (cls) => items.find((i) => i.src.className === cls),
    heroColumns: HERO_COLUMNS,
    itemColumns: ITEM_COLUMNS,
  };
}

export const noAnalytics = async () => { throw new Error("no analytics in tests"); };

export const ability = (id: number, heroId: number, slot: number, name: string, over: Partial<AbilityData> = {}): AbilityData => ({
  id, heroId, name, slot, aliases: [], exclude: [], icon: `/media/${"c".repeat(39)}${slot}`,
  src: { id, className: `ability_${name.toLowerCase().replace(/ /g, "_")}`, name, heroId, slot, image: null, description: "", quip: null, tiers: [null, null, null] },
  ...over,
});
