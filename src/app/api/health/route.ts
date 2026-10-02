// Health check for uptime monitoring: 503 when the last sync failed/is stale or today has no puzzles.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayDate } from "@/lib/day";
import { LOCKS } from "@/locks.config";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = todayDate();
  try {
    const [lastSync, lastOk, puzzles] = await Promise.all([
      db.syncRun.findFirst({ where: { kind: "assets" }, orderBy: { id: "desc" } }),
      db.syncRun.findFirst({ where: { kind: "assets", status: "ok" }, orderBy: { id: "desc" } }),
      db.dailyPuzzle.findMany({ where: { date: today }, select: { mode: true, sealed: true } }),
    ]);
    const syncAgeH = lastOk?.finishedAt ? (Date.now() - lastOk.finishedAt.getTime()) / 3600000 : Infinity;
    const live = puzzles.filter((p) => !p.sealed).length;
    const problems: string[] = [];
    if (lastSync?.status === "failed") problems.push("last sync failed");
    // Sync runs daily with up to ±59 min drift on Vercel Hobby: allow some slack.
    if (syncAgeH > 36) problems.push(`last successful sync ${Number.isFinite(syncAgeH) ? Math.round(syncAgeH) + "h" : "never"} ago`);
    if (live === 0) problems.push("no playable puzzle today");
    const missing = LOCKS.filter((l) => !puzzles.some((p) => p.mode === l.slug)).map((l) => l.slug);
    return NextResponse.json(
      { ok: problems.length === 0, today, livePuzzles: live, sealed: puzzles.filter((p) => p.sealed).map((p) => p.mode), missing, lastSync: lastSync?.status, lastOkSyncAt: lastOk?.finishedAt, problems },
      { status: problems.length ? 503 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // The driver's message can name the host or user: keep it in the server log, not in a public response.
    console.error("[health] database check failed", e);
    return NextResponse.json({ ok: false, problems: ["database unreachable"] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
