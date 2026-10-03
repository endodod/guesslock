// In-memory view of the DB used to generate puzzles and to build the guess catalog.
// Curation values override API values where both exist.
import { db } from "../db";
import { readSetting } from "../settings";
import type { NormAbility, NormHero, NormItem } from "../deadlock/types";
import { mediaUrl } from "../media";
import { usableText } from "../text/entries";
import { parseSetup, type HeroSetup } from "../admin/setup";
import { DEFAULT_EMOJIS } from "../data/emojis";
import { HERO_COLUMNS, ITEM_COLUMNS, WEAPON_GROUPS_KEY, parseWeaponGroups, resolveColumns, weaponFamily, weaponInfo, type Attrs, type ColumnDef, type WeaponGroups } from "./columns";

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
  /** Weapon family from the admin's weapon groups (The Reckoning's Weapon column). Unset: the default groups apply. */
  weaponFamily?: string | null;
  /** The family of the API's own weapon type (what an admin override of the Weapon column is compared to). */
  apiWeaponFamily?: string | null;
  releaseDate: string | null;
  emojis: string[];
  emojisReviewed: boolean;
  genericVoice: boolean;
  /** Admin overrides per mode (see src/lib/admin/setup.ts). */
  setup: HeroSetup;
  /** Category values (admin overrides of API columns, custom categories). */
  attrs: Attrs;
  card: string | null;
  /** The Visage portrait: the admin override, else the card. */
  splash: string | null;
  /** The Shadow: the second transparent portrait, else the card. */
  shadow: string | null;
  /** The Arsenal: curated weapon cut-out (admin setup), null when none is set. */
  weapon: string | null;
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
  attrs: Attrs;
  image: string | null;
  glyph: string | null;
};

/** `section` is the wiki section the line was listed under (a hero's name for lines spoken to that hero). */
export type VoiceLineData = { id: number; text: string; audio: string | null; starred: boolean; section?: string };

/** A wiki voice entry (The Echo family): a Select line, an ability cast line or a complete conversation. */
export type VoiceEntryData = {
  id: number; kind: "select" | "cast" | "convo"; fileKey: string; abilityId: number | null; abilitySlot: number | null;
  otherHeroId: number | null; text: string | null; lines: { h: number; t: string }[] | null;
};

/** An approved sound clip (The Resonance). `url` is always an opaque /media/<sha1> URL. */
export type SoundData = { id: number; url: string; role: string; gainDb: number; durationMs: number; preferred: boolean };

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
  voiceEntries(heroId: number, kind: VoiceEntryData["kind"]): VoiceEntryData[];
  /** Approved, mirrored clips of one ability / of one hero's gun (The Resonance). */
  abilitySounds(abilityId: number): SoundData[];
  weaponSounds(heroId: number): SoundData[];
  /** Codename and sound folder names of a hero: leak terms, since they appear in upstream URLs. */
  soundCodenames(heroId: number): string[];
  buildsInto(className: string): NormItem[];
  itemByClass(className: string): ItemData | undefined;
  /** Attribute columns with admin category settings applied (see columns.ts). */
  heroColumns: ColumnDef<HeroData>[];
  itemColumns: ColumnDef<ItemData>[];
  /** Weapon type -> family table (edited in /admin/weapons). */
  weaponGroups: WeaponGroups;
};

/** Category values: plain strings/numbers only. */
export function parseAttrs(raw: unknown): Attrs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))),
  ) as Attrs;
}

export async function loadGameData(): Promise<GameData> {
  const [heroRows, abilityRows, itemRows, texts, lines, categories, clips, soundMaps, entryRows, groupsRow] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.ability.findMany({ where: { active: true }, orderBy: [{ heroId: "asc" }, { slot: "asc" }] }),
    db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.textEntry.findMany(),
    // Every line that passed the automatic filters; "needs_redaction" lines use their redacted text.
    db.voiceLine.findMany({ where: { status: { not: "excluded" } }, orderBy: { id: "asc" } }),
    db.category.findMany(),
    // Only reviewed and mirrored clips: nothing unreviewed is ever used.
    db.soundClip.findMany({ where: { status: "approved", assetId: { not: null } }, orderBy: { id: "asc" } }),
    db.heroSoundMap.findMany(),
    db.voiceEntry.findMany({ where: { status: "approved" }, orderBy: { id: "asc" } }),
    readSetting(WEAPON_GROUPS_KEY),
  ]);
  const weaponGroups = parseWeaponGroups(groupsRow?.value);
  const entriesBy = new Map<string, VoiceEntryData[]>();
  for (const e of entryRows) {
    const k = `${e.heroId}:${e.kind}`;
    if (!entriesBy.has(k)) entriesBy.set(k, []);
    entriesBy.get(k)!.push({
      id: e.id, kind: e.kind as VoiceEntryData["kind"], fileKey: e.fileKey, abilityId: e.abilityId === null ? null : Number(e.abilityId),
      abilitySlot: e.abilitySlot, otherHeroId: e.otherHeroId, text: e.text, lines: (e.lines as { h: number; t: string }[] | null) ?? null,
    });
  }

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
      weaponFamily: weaponFamily(h.weaponTypeOverride || src.gunTag, weaponGroups),
      apiWeaponFamily: weaponFamily(src.gunTag, weaponGroups),
      releaseDate: h.releaseDate ? h.releaseDate.toISOString().slice(0, 10) : null,
      // The Cipher needs 10: a hero without a complete set uses the default one (the sync also stores it).
      emojis: h.emojis.length >= 10 ? h.emojis : DEFAULT_EMOJIS[h.name] ?? h.emojis,
      emojisReviewed: h.emojisReviewed,
      genericVoice: h.genericVoice,
      setup,
      attrs: parseAttrs(h.attrs),
      card: mediaUrl(src.images.card),
      splash: mediaUrl(setup.splash ?? src.images.card),
      shadow: mediaUrl(src.images.gloat ?? src.images.card),
      weapon: mediaUrl(setup.weapon),
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
      id: Number(i.id), name: i.name, aliases: i.aliases, exclude: i.excludeFromModes, src, attrs: parseAttrs(i.attrs),
      image: mediaUrl(src.image), glyph: mediaUrl(src.glyph),
    };
  });

  const textMap = new Map(texts.map((t) => [`${t.entityType}:${Number(t.entityId)}`, t]));
  const linesByHero = new Map<number, VoiceLineData[]>();
  for (const l of lines) {
    if (!linesByHero.has(l.heroId)) linesByHero.set(l.heroId, []);
    linesByHero.get(l.heroId)!.push({
      id: l.id, text: (l.text ?? l.autoText).trim(), starred: l.starred, section: l.section,
      audio: l.audioAssetId ? `/media/${l.audioAssetId}` : null,
    });
  }
  const abilitySounds = new Map<number, SoundData[]>();
  const weaponSounds = new Map<number, SoundData[]>();
  for (const c of clips) {
    const d: SoundData = { id: c.id, url: `/media/${c.assetId}`, role: c.role, gainDb: c.gainDb ?? 0, durationMs: c.durationMs ?? 0, preferred: c.preferred };
    const [map, key] = c.kind === "weapon" ? [weaponSounds, c.heroId] : [abilitySounds, c.abilityId === null ? null : Number(c.abilityId)];
    if (key === null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  const soundMapBy = new Map(soundMaps.map((m) => [m.heroId, m]));
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
    voiceEntries: (heroId, kind) => entriesBy.get(`${heroId}:${kind}`) ?? [],
    abilitySounds: (id) => abilitySounds.get(id) ?? [],
    weaponSounds: (heroId) => weaponSounds.get(heroId) ?? [],
    soundCodenames: (heroId) => {
      const m = soundMapBy.get(heroId);
      const code = heroById.get(heroId)?.className.replace(/^hero_/, "");
      return [...new Set([code, ...(m?.abilityFolders ?? []), ...(m?.weaponFolders ?? [])].filter((x): x is string => !!x))];
    },
    buildsInto: (cls) => items.filter((i) => i.src.componentClassNames.includes(cls)).map((i) => i.src),
    itemByClass: (cls) => itemByClass.get(cls),
    // The Weapon column's default explanation lists the current groups (an admin-written one still wins).
    heroColumns: resolveColumns("hero", HERO_COLUMNS.map((c) => (c.key === "weapon" ? { ...c, info: weaponInfo(weaponGroups) } : c)), categories),
    weaponGroups,
    itemColumns: resolveColumns("item", ITEM_COLUMNS, categories),
  };
}
