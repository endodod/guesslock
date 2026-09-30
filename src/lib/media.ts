// Mirrors upstream images/audio into Postgres so puzzles survive upstream URL changes.
// Ids are sha1(sourceUrl): opaque (no hero names in URLs) and deterministic.
import { createHash } from "node:crypto";
import { db } from "./db";

export function mediaId(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

export function mediaUrl(url: string | null | undefined): string | null {
  return url ? `/media/${mediaId(url)}` : null;
}

const MAX_BYTES = 8 * 1024 * 1024;

export async function mirror(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  const id = mediaId(url);
  const existing = await db.mirroredAsset.findUnique({ where: { id }, select: { id: true } });
  if (existing) return id;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) throw new Error(`bad size ${buf.length}`);
    const contentType = res.headers.get("content-type")?.split(";")[0] ?? guessType(url);
    await db.mirroredAsset.upsert({
      where: { id },
      create: { id, sourceUrl: url, contentType, bytes: buf, byteSize: buf.length },
      update: {},
    });
    return id;
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
