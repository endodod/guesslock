// Asset sync + Omen harvest + puzzle top-up (daily). Auth: Authorization: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { checkCronAuth } from "@/lib/admin/auth";
import { runAssetSync } from "@/lib/sync/assets";
import { generateAhead } from "@/lib/engine/generate";
import { harvest } from "@/lib/omens/harvest";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const sync = await runAssetSync();
  revalidateTag("catalog", { expire: 0 });
  // Omen replay queries take about a minute each: harvest until ~4 min into the run.
  const omens = await harvest(started + 240_000).catch((e) => ({ error: (e as Error).message }));
  // Keep the 7-day buffer topped up even when the sync failed (e.g. an API outage): the DB still has
  // the last good data, and API fallbacks cover the rest (see README "API outage backup").
  const gen = await generateAhead();
  return NextResponse.json({
    sync: { id: sync.id, status: sync.status, error: sync.error?.split("\n")[0] },
    omens,
    generated: gen.filter((g) => g.status === "created").length,
  }, { status: sync.status === "ok" ? 200 : 500 });
}
