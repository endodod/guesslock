// Puzzle generation (schedule daily, shortly before 00:00 Europe/Zurich). Auth: Bearer $CRON_SECRET.
import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/admin/auth";
import { generateAhead } from "@/lib/engine/generate";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await generateAhead();
  const errors = results.filter((r) => r.status === "error");
  return NextResponse.json({
    created: results.filter((r) => r.status === "created").length,
    sealed: results.filter((r) => r.status === "sealed").map((r) => `${r.date}/${r.slug}`),
    errors: errors.map((e) => `${e.date}/${e.slug}: ${e.note}`),
  }, { status: errors.length ? 500 : 200 });
}
