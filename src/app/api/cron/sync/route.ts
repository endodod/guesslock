// Asset sync + sound index check + Omen harvest + puzzle top-up (daily). Auth: Authorization: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { checkCronAuth } from "@/lib/admin/auth";
import { runAssetSync } from "@/lib/sync/assets";
import { generateAhead } from "@/lib/engine/generate";
import { dailySoundSync } from "@/lib/sounds/import";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const sync = await runAssetSync();
  revalidateTag("catalog", { expire: 0 });
  // The Resonance: refresh the sound index, re-check approved clips, measure new suggestions (~60 s).
  const sounds = await dailySoundSync(started + 90_000);
  // Keep the 7-day buffer topped up even when the sync failed (e.g. an API outage): the DB still has
  // the last good data, and API fallbacks cover the rest (see README "API outage backup").
  // Generation harvests the Omens it needs first (replay queries take ~1 min): until ~4 min in.
  const gen = await generateAhead(undefined, { harvestUntil: started + 240_000 });
  return NextResponse.json({
    sync: { id: sync.id, status: sync.status, error: sync.error?.split("\n")[0] },
    sounds,
    generated: gen.filter((g) => g.status === "created").length,
  }, { status: sync.status === "ok" ? 200 : 500 });
}
