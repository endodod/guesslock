// A restorable copy of everything curated or imported by hand (not re-fetchable from the API): hero species/release/
// gender/emojis/attrs/setup, categories, wiki voice entries, approved clip metadata (the audio stays in MirroredAsset)
// admin-edited texts, admin settings (weapon groups) and the Séance, Bazaar and Grimoire groups with their memberships. Stored in ApiSnapshot (the daily cron keeps "curation-latest"; `npm run backup:curation` adds a dated copy).
import { db } from "../db";
import { saveSnapshot } from "../deadlock/snapshots";

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

export async function snapshotCuration(key: string) {
  const [heroes, categories, voiceEntries, soundClips, soundMaps, texts, seance, settings] = await Promise.all([
    db.hero.findMany({ select: { id: true, name: true, aliases: true, excludeFromModes: true, genderOverride: true, species: true, weaponTypeOverride: true, releaseDate: true, emojis: true, emojisReviewed: true, genericVoice: true, genericVoiceManual: true, attrs: true, setup: true } }),
    db.category.findMany(),
    db.voiceEntry.findMany(),
    db.soundClip.findMany({ where: { status: "approved" } }),
    db.heroSoundMap.findMany(),
    db.textEntry.findMany({ where: { finalText: { not: null } } }),
    db.seanceCategory.findMany({ include: { memberships: true } }),
    db.setting.findMany(),
  ]);
  const data = json({ takenAt: new Date().toISOString(), heroes, categories, voiceEntries, soundClips, soundMaps, texts, seance, settings });
  await saveSnapshot(key, "db:curation", data);
  return { data, counts: { heroes: heroes.length, voiceEntries: voiceEntries.length, clips: soundClips.length, categories: categories.length, groups: seance.length } };
}
