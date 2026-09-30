// Daily job: import due voice lines (The Echo), then generate puzzles. Auth: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/admin/auth";
import { generateAhead } from "@/lib/engine/generate";
import { importDueVoiceLines } from "@/lib/wiki/voicelines";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Leave room for generation within the 300s function limit.
  const voice = await importDueVoiceLines(150_000).catch((e) => [{ status: "error", note: String(e) }]);
  const results = await generateAhead();
  const errors = results.filter((r) => r.status === "error");
  return NextResponse.json({
    voiceLines: voice.map((v) => ("hero" in v ? `${v.hero}: ${v.status}` : `error: ${v.note}`)),
    created: results.filter((r) => r.status === "created").length,
    sealed: results.filter((r) => r.status === "sealed").map((r) => `${r.date}/${r.slug}`),
    errors: errors.map((e) => `${e.date}/${e.slug}: ${e.note}`),
  }, { status: errors.length ? 500 : 200 });
}
