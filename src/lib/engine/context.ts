// In-memory view of the DB used to generate puzzles and to build the guess catalog.
// Curation values override API values where both exist.
import { db } from "../db";
import type { NormAbility, NormHero, NormItem } from "../deadlock/types";
import { mediaUrl } from "../media";
import { usableText } from "../text/entries";
import { parseSetup, type HeroSetup } from "../admin/setup";

export type HeroData = {
  id: number;
  name: string;
  className: string;
  aliases: string[];
  exclude: string[];
  /** Eligible as an answer (every active hero; no curation gate). */
  eligible: boolean;
  src: NormHero;
  gender: string | null;
  species: string | null;
  weaponType: string | null;
  releaseDate: string | null;
  emojis: string[];
  emojisReviewed: boolean;
  genericVoice: boolean;
  /** Admin overrides per mode (see src/lib/admin/setup.ts). */
  setup: HeroSetup;
  card: string | null;
  /** The Visage portrait: the admin override, else the card. */
  splash: string | null;
  icon: string | null;
};

export type AbilityData = {
  id: number;
  heroId: number;
  name: string;
  slot: number;
  aliases: string[];
  exclude: string[];
  src: NormAbility;
  icon: string | null;
};

export type ItemData = {
  id: number;
  name: string;
  aliases: string[];
  exclude: string[];
  src: NormItem;
  image: string | null;
  glyph: string | null;
};

export type VoiceLineData = { id: number; text: string; audio: string | null; starred: boolean };

export type GameData = {
  heroes: HeroData[];
  abilities: AbilityData[];
  items: ItemData[];
  hero(id: number): HeroData | undefined;
  ability(id: number): AbilityData | undefined;
  item(id: number): ItemData | undefined;
  abilitiesOf(heroId: number): AbilityData[];
  text(type: string, id: number): string | null;
  voiceLines(heroId: number): VoiceLineData[];
  buildsInto(className: string): NormItem[];
  itemByClass(className: string): ItemData | undefined;
};

export async function loadGameData(): Promise<GameData> {
  const [heroRows, abilityRows, itemRows, texts, lines] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.ability.findMany({ where: { active: true }, orderBy: [{ heroId: "asc" }, { slot: "asc" }] }),
    db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.textEntry.findMany(),
    // Every line that passed the automatic filters; "needs_redaction" lines use their redacted text.
    db.voiceLine.findMany({ where: { status: { not: "excluded" } }, orderBy: { id: "asc" } }),
  ]);

  const heroes: HeroData[] = heroRows.map((h) => {
    const src = h.source as unknown as NormHero;
    const setup = parseSetup(h.setup);
    return {
      id: h.id,
      name: h.name,
      className: h.className,
      aliases: h.aliases,
      exclude: h.excludeFromModes,
      eligible: true,
      src,
      gender: h.genderOverride || src.gender,
      species: h.species,
      weaponType: h.weaponTypeOverride || src.gunTag,
      releaseDate: h.releaseDate ? h.releaseDate.toISOString().slice(0, 10) : null,
      emojis: h.emojis,
      emojisReviewed: h.emojisReviewed,
      genericVoice: h.genericVoice,
      setup,
      card: mediaUrl(src.images.card),
      splash: mediaUrl(setup.splash ?? src.images.card),
      icon: mediaUrl(src.images.small),
    };
  });
  const heroIds = new Set(heroes.map((h) => h.id));
  const abilities: AbilityData[] = abilityRows
    .filter((a) => heroIds.has(a.heroId))
    .map((a) => {
      const src = a.source as unknown as NormAbility;
      return {
        id: Number(a.id), heroId: a.heroId, name: a.name, slot: a.slot,
        aliases: a.aliases, exclude: a.excludeFromModes, src, icon: mediaUrl(src.image),
      };
    });
  const items: ItemData[] = itemRows.map((i) => {
    const src = i.source as unknown as NormItem;
    return {
      id: Number(i.id), name: i.name, aliases: i.aliases, exclude: i.excludeFromModes, src,
      image: mediaUrl(src.image), glyph: mediaUrl(src.glyph),
    };
  });

  const textMap = new Map(texts.map((t) => [`${t.entityType}:${Number(t.entityId)}`, t]));
  const linesByHero = new Map<number, VoiceLineData[]>();
  for (const l of lines) {
    if (!linesByHero.has(l.heroId)) linesByHero.set(l.heroId, []);
    linesByHero.get(l.heroId)!.push({
      id: l.id, text: (l.text ?? l.autoText).trim(), starred: l.starred,
      audio: l.audioAssetId ? `/media/${l.audioAssetId}` : null,
    });
  }
  const heroById = new Map(heroes.map((h) => [h.id, h]));
  const abilityById = new Map(abilities.map((a) => [a.id, a]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const itemByClass = new Map(items.map((i) => [i.src.className, i]));

  return {
    heroes, abilities, items,
    hero: (id) => heroById.get(id),
    ability: (id) => abilityById.get(id),
    item: (id) => itemById.get(id),
    abilitiesOf: (heroId) => abilities.filter((a) => a.heroId === heroId),
    text: (type, id) => usableText(textMap.get(`${type}:${id}`)),
    voiceLines: (heroId) => linesByHero.get(heroId) ?? [],
    buildsInto: (cls) => items.filter((i) => i.src.componentClassNames.includes(cls)).map((i) => i.src),
    itemByClass: (cls) => itemByClass.get(cls),
  };
}
