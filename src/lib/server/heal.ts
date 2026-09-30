// Self-healing daily puzzles: when a visitor sees today's vault with a lock that has no puzzle yet
// (or a sealed one), generation runs for those locks after the response. This makes a fresh deploy
// or a missed cron recover on the next page view instead of waiting for the daily job.
import { after } from "next/server";
import { db } from "../db";
import { generateDay } from "../engine/generate";
import type { LockMeta } from "./puzzles";

const EVERY_MS = 10 * 60 * 1000;
let lastLocal = 0;

export function healToday(date: string, meta: LockMeta[]) {
  const missing = meta.filter((m) => m.state !== "available").map((m) => m.slug);
  if (missing.length === 0 || Date.now() - lastLocal < EVERY_MS) return;
  lastLocal = Date.now();
  after(async () => {
    try {
      // One attempt per 10 minutes across all server instances.
      const recent = await db.syncRun.findFirst({ where: { kind: "heal", startedAt: { gte: new Date(Date.now() - EVERY_MS) } } });
      if (recent) return;
      const run = await db.syncRun.create({ data: { kind: "heal", status: "running" } });
      const res = await generateDay(date, { slugs: missing });
      const made = res.filter((r) => r.status === "created").map((r) => r.slug);
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "ok", finishedAt: new Date(), counts: { date, tried: missing, created: made, notes: res.filter((r) => r.note).map((r) => `${r.slug}: ${r.note}`) } },
      });
    } catch (e) {
      console.error("[heal]", e);
    }
  });
}
