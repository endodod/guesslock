// Asset sync (schedule every 6h). Auth: Authorization: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { checkCronAuth } from "@/lib/admin/auth";
import { runAssetSync } from "@/lib/sync/assets";
import { generateAhead } from "@/lib/engine/generate";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sync = await runAssetSync();
  revalidateTag("catalog", { expire: 0 });
  // Keep the 7-day buffer topped up after every sync.
  const gen = sync.status === "ok" ? await generateAhead() : [];
  return NextResponse.json({
    sync: { id: sync.id, status: sync.status, error: sync.error?.split("\n")[0] },
    generated: gen.filter((g) => g.status === "created").length,
  }, { status: sync.status === "ok" ? 200 : 500 });
}
