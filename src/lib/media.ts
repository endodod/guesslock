// Mirrors upstream images/audio into Postgres so puzzles survive upstream URL changes.
// Ids are sha1(sourceUrl): opaque (no hero names in URLs) and deterministic.
import { createHash } from "node:crypto";
import { db } from "./db";
import { config } from "./config";

export function mediaId(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/**
 * Sound clips (The Resonance) get a salted id: the sound index is public, so plain sha1(url) could be
 * looked up in a precomputed table of every clip, and the URL names the hero.
 */
export function soundMediaId(url: string): string {
  return createHash("sha1").update(`sound:${config.salt}:${url}`).digest("hex");
}

export function mediaUrl(url: string | null | undefined): string | null {
  return url ? `/media/${mediaId(url)}` : null;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** Store already-downloaded bytes under an id (no-op if the id exists). */
export async function storeAsset(id: string, sourceUrl: string, bytes: Uint8Array, contentType = guessType(sourceUrl)): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error(`bad size ${bytes.length}`);
  // Ids are content-addressed: a concurrent write of the same id stored the same bytes, so a duplicate is fine.
  await db.mirroredAsset.createMany({
    data: [{ id, sourceUrl, contentType, bytes: Buffer.from(bytes), byteSize: bytes.length }],
    skipDuplicates: true,
  });
  // Skipped for another reason (the same source URL under a different id): that is a real conflict.
  if (!(await db.mirroredAsset.findUnique({ where: { id }, select: { id: true } }))) throw new Error(`asset ${id} not stored: ${sourceUrl} is mirrored under another id`);
  return id;
}

const MAX_MIRROR_BYTES = 25 * 1024 * 1024;

export async function mirror(url: string, headers: Record<string, string> = {}, id = mediaId(url)): Promise<string | null> {
  const existing = await db.mirroredAsset.findUnique({ where: { id }, select: { id: true } });
  if (existing) return id;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // A mirrored file lives in Postgres and in memory: refuse anything unreasonable before reading it.
    if (Number(res.headers.get("content-length") ?? 0) > MAX_MIRROR_BYTES) throw new Error("file too large");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MIRROR_BYTES) throw new Error("file too large");
    const contentType = res.headers.get("content-type")?.split(";")[0] ?? guessType(url);
    return await storeAsset(id, url, buf, contentType);
  } catch (e) {
    console.warn(`[media] mirror failed for ${url}:`, (e as Error).message);
    return null;
  }
}

/** Mirror many URLs with bounded concurrency. Returns the set of URLs that failed. */
export async function mirrorAll(urls: string[], concurrency = 6): Promise<string[]> {
  const unique = [...new Set(urls.filter(Boolean))];
  const have = new Set(
    (await db.mirroredAsset.findMany({ where: { id: { in: unique.map(mediaId) } }, select: { id: true } })).map((r) => r.id),
  );
  const todo = unique.filter((u) => !have.has(mediaId(u)));
  const failed: string[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < todo.length) {
        const u = todo[i++];
        if (!(await mirror(u))) failed.push(u);
      }
    }),
  );
  return failed;
}

function guessType(url: string): string {
  if (/\.png$/i.test(url)) return "image/png";
  if (/\.webp$/i.test(url)) return "image/webp";
  if (/\.jpe?g$/i.test(url)) return "image/jpeg";
  if (/\.svg$/i.test(url)) return "image/svg+xml";
  if (/\.mp3$/i.test(url)) return "audio/mpeg";
  if (/\.ogg$/i.test(url)) return "audio/ogg";
  return "application/octet-stream";
}
