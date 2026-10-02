// Asset sync + sound index check + wiki voice/sound check + Omen harvest + puzzle top-up (daily). Auth: Authorization: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { checkCronAuth } from "@/lib/admin/auth";
import { runAssetSync } from "@/lib/sync/assets";
import { generateAhead } from "@/lib/engine/generate";
import { dailySoundSync } from "@/lib/sounds/import";
import { dailyWikiSync } from "@/lib/wiki/daily";
import { snapshotCuration } from "@/lib/backup/curation";
import { pruneEndless } from "@/lib/endless";
import { pruneRateLimits } from "@/lib/server/sharedlimit";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const sync = await runAssetSync();
  revalidateTag("catalog", { expire: 0 });
  // The Resonance: refresh the sound index, re-check approved clips, measure new suggestions (~60 s).
  const sounds = await dailySoundSync(started + 90_000);
  // The Echo family and The Resonance: only wiki pages whose revision changed are re-imported (usually none).
  const wiki = await dailyWikiSync(started + 150_000).catch((e) => ({ error: String(e) }));
  // Rolling copy of the curated data (the API snapshots refresh themselves on every successful fetch).
  const backup = await snapshotCuration("curation-latest").then((b) => b.counts).catch((e) => ({ error: String(e) }));
  // Keep the 7-day buffer topped up even when the sync failed (e.g. an API outage): the DB still has
  // the last good data, and API fallbacks cover the rest (see README "API outage backup").
  // Generation harvests the Omens it needs first (replay queries take ~1 min): until ~4 min in.
  const gen = await generateAhead(undefined, { harvestUntil: started + 240_000 });
  // Endless mode: practice puzzles (and their clue images) older than a week.
  const endless = await pruneEndless().catch((e) => ({ error: String(e) }));
  // Rate-limit counters whose window has ended.
  const limits = await pruneRateLimits().catch((e) => ({ error: String(e) }));
  return NextResponse.json({
    limits,
    sync: { id: sync.id, status: sync.status, error: sync.error?.split("\n")[0] },
    sounds,
    wiki,
    backup,
    endless,
    generated: gen.filter((g) => g.status === "created").length,
  }, { status: sync.status === "ok" ? 200 : 500 });
}
