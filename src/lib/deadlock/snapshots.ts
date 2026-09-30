// Outage backup for external API calls. Every successful response is stored in ApiSnapshot under a
// stable key; when the API is unreachable, callers can fall back to that snapshot (or, on a fresh
// database, to the gzipped copy committed under data/api-backup/). `npm run backup` refreshes both.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { db } from "../db";
import { config } from "../config";
import type { Prisma } from "@/generated/prisma/client";

export const BACKUP_DIR = path.join(process.cwd(), "data", "api-backup");

export type Snapshot = { data: unknown; fetchedAt: Date; source: "db" | "file" };

export async function saveSnapshot(key: string, url: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data);
  try {
    await db.apiSnapshot.upsert({
      where: { key },
      create: { key, url, data: data as Prisma.InputJsonValue, byteSize: json.length, fetchedAt: new Date() },
      update: { url, data: data as Prisma.InputJsonValue, byteSize: json.length, fetchedAt: new Date() },
    });
  } catch (e) {
    // The live response is still usable; a failed backup write must not break the caller.
    console.warn(`[snapshot] could not store ${key}:`, (e as Error).message);
  }
}

function readBundled(key: string): Snapshot | null {
  const file = path.join(BACKUP_DIR, `${key}.json.gz`);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { fetchedAt: string; data: unknown };
    return { data: parsed.data, fetchedAt: new Date(parsed.fetchedAt), source: "file" };
  } catch (e) {
    console.warn(`[snapshot] bundled backup ${key} unreadable:`, (e as Error).message);
    return null;
  }
}

/** Newest usable copy: the DB snapshot, else the bundled file. Older than maxAgeDays counts as missing. */
export async function loadSnapshot(key: string, maxAgeDays = config.apiBackupMaxDays): Promise<Snapshot | null> {
  let snap: Snapshot | null = null;
  try {
    const row = await db.apiSnapshot.findUnique({ where: { key } });
    if (row) snap = { data: row.data, fetchedAt: row.fetchedAt, source: "db" };
  } catch (e) {
    console.warn(`[snapshot] could not read ${key}:`, (e as Error).message);
  }
  const bundled = readBundled(key);
  if (bundled && (!snap || bundled.fetchedAt > snap.fetchedAt)) snap = bundled;
  if (!snap) return null;
  const ageDays = (Date.now() - snap.fetchedAt.getTime()) / 86400000;
  return ageDays <= maxAgeDays ? snap : null;
}
