// Usage: npm run import:weapons [-- --force]
// The Arsenal: takes every hero's weapon picture (File:<Hero>_Weapon.png) from the wiki, checks it is a transparent PNG
// cut-out like the admin form does, mirrors it and stores it in the hero's setup. Heroes that already have one are kept.
import "dotenv/config";
import { db } from "../src/lib/db";
import { config } from "../src/lib/config";
import { mirror } from "../src/lib/media";
import { parseSetup } from "../src/lib/admin/setup";
import { decodePng, silhouette } from "../src/lib/image/png";

const force = process.argv.includes("--force");

async function wikiFileUrls(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < names.length; i += 40) {
    const titles = names.slice(i, i + 40).map((n) => `File:${n.replace(/ /g, "_")}_Weapon.png`).join("|");
    const u = `${config.wikiApi}?action=query&prop=imageinfo&iiprop=url|mime&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(titles)}`;
    const j = (await (await fetch(u, { headers: { "user-agent": config.wikiUserAgent } })).json()) as {
      query?: { pages?: { title: string; imageinfo?: { url: string; mime: string }[] }[] };
    };
    for (const p of j.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (info?.mime === "image/png") out.set(p.title.replace(/^File:/, "").replace(/ Weapon\.png$/, ""), info.url);
    }
  }
  return out;
}

(async () => {
  const heroes = await db.hero.findMany({ select: { id: true, name: true, setup: true }, orderBy: { id: "asc" } });
  const urls = await wikiFileUrls(heroes.map((h) => h.name));
  let ok = 0;
  for (const h of heroes) {
    const url = urls.get(h.name);
    const setup = parseSetup(h.setup);
    if (setup.weapon && !force) { console.log(h.name, "kept"); continue; }
    if (!url) { console.log(h.name, "no wiki picture"); continue; }
    const id = await mirror(url);
    const asset = id ? await db.mirroredAsset.findUnique({ where: { id }, select: { bytes: true } }) : null;
    try {
      if (!asset || !silhouette(decodePng(asset.bytes))) { console.log(h.name, "skipped: not a transparent cut-out"); continue; }
    } catch { console.log(h.name, "skipped: unsupported PNG"); continue; }
    await db.hero.update({ where: { id: h.id }, data: { setup: parseSetup({ ...setup, weapon: url }) } });
    ok++;
    console.log(h.name, "ok", url);
  }
  console.log(`${ok} weapon pictures imported`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
