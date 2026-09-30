// Daily job: import due voice lines (The Echo), harvest Omens, then generate puzzles. Auth: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/admin/auth";
import { generateAhead } from "@/lib/engine/generate";
import { harvest } from "@/lib/omens/harvest";
import { importDueVoiceLines } from "@/lib/wiki/voicelines";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  // Budget within the 300 s function limit: voice lines, then the second daily Omen harvest
  // (collects replay queries submitted by the sync run), then generation.
  const voice = await importDueVoiceLines(100_000).catch((e) => [{ status: "error", note: String(e) }]);
  const omens = await harvest(started + 220_000).catch((e) => ({ error: (e as Error).message }));
  const results = await generateAhead();
  const errors = results.filter((r) => r.status === "error");
  return NextResponse.json({
    voiceLines: voice.map((v) => ("hero" in v ? `${v.hero}: ${v.status}` : `error: ${v.note}`)),
    created: results.filter((r) => r.status === "created").length,
    sealed: results.filter((r) => r.status === "sealed").map((r) => `${r.date}/${r.slug}`),
    errors: errors.map((e) => `${e.date}/${e.slug}: ${e.note}`),
    omens,
  }, { status: errors.length ? 500 : 200 });
}
