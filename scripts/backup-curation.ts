// Usage: npm run backup:curation
// Stores a restorable copy of everything that was curated or imported by hand (not re-fetchable from the API):
// hero species/release/gender/emoji/attrs/setup, categories, wiki voice entries, sound clip metadata (the audio
// itself stays in MirroredAsset). Written to ApiSnapshot under a dated key, plus a gzipped file in data/curation-backup/.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { db } from "../src/lib/db";
import { saveSnapshot } from "../src/lib/deadlock/snapshots";

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

(async () => {
  const [heroes, categories, voiceEntries, soundClips, soundMaps, texts] = await Promise.all([
    db.hero.findMany({ select: { id: true, name: true, aliases: true, excludeFromModes: true, genderOverride: true, species: true, weaponTypeOverride: true, releaseDate: true, emojis: true, emojisReviewed: true, genericVoice: true, genericVoiceManual: true, attrs: true, setup: true } }),
    db.category.findMany(),
    db.voiceEntry.findMany(),
    db.soundClip.findMany({ where: { status: "approved" } }),
    db.heroSoundMap.findMany(),
    db.textEntry.findMany({ where: { finalText: { not: null } } }),
  ]);
  const data = json({ takenAt: new Date().toISOString(), heroes, categories, voiceEntries, soundClips, soundMaps, texts });
  const key = `curation-${new Date().toISOString().slice(0, 10)}`;
  await saveSnapshot(key, "db:curation", data);
  const dir = path.join(process.cwd(), "data", "curation-backup");
  mkdirSync(dir, { recursive: true });
  const gz = gzipSync(JSON.stringify(data), { level: 9 });
  writeFileSync(path.join(dir, `${key}.json.gz`), gz);
  console.log(`${key}: ${heroes.length} heroes, ${voiceEntries.length} voice entries, ${soundClips.length} approved clips, ${categories.length} categories -> ApiSnapshot + ${(gz.length / 1024).toFixed(0)} KiB file`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
