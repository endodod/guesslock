// Daily job: import due voice lines (The Echo), then generate puzzles (with the built-in Omen harvest). Auth: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/admin/auth";
import { generateAhead } from "@/lib/engine/generate";
import { importDueVoiceLines } from "@/lib/wiki/voicelines";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  // Budget within the 300 s function limit: voice lines first, then generation.
  const voice = await importDueVoiceLines(100_000).catch((e) => [{ status: "error", note: String(e) }]);
  // Generation harvests the Omens it still needs first, within the function's time limit.
  const results = await generateAhead(undefined, { harvestUntil: started + 230_000 });
  const errors = results.filter((r) => r.status === "error");
  return NextResponse.json({
    voiceLines: voice.map((v) => ("hero" in v ? `${v.hero}: ${v.status}` : `error: ${v.note}`)),
    created: results.filter((r) => r.status === "created").length,
    sealed: results.filter((r) => r.status === "sealed").map((r) => `${r.date}/${r.slug}`),
    errors: errors.map((e) => `${e.date}/${e.slug}: ${e.note}`),
  }, { status: errors.length ? 500 : 200 });
}
