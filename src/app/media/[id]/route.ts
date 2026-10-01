// Serves mirrored images/audio from Postgres. Ids are content-addressed by source URL: cache forever.
import { db } from "@/lib/db";

type Cached = { bytes: Buffer; contentType: string; at: number };

// Every image is its own request, and a database read costs a network round trip: keep recently served files in
// memory (bounded, least recently used first out, entries expire so a replaced asset doesn't stay stale for long).
const MAX_BYTES = 48 * 1024 * 1024;
const MAX_ENTRY = 2 * 1024 * 1024;
const TTL_MS = 10 * 60_000;
const cache = new Map<string, Cached>();
let cachedBytes = 0;

function remember(id: string, entry: Cached) {
  if (entry.bytes.length > MAX_ENTRY) return;
  const old = cache.get(id);
  if (old) cachedBytes -= old.bytes.length;
  cache.delete(id);
  cache.set(id, entry);
  cachedBytes += entry.bytes.length;
  for (const [k, v] of cache) {
    if (cachedBytes <= MAX_BYTES) break;
    cache.delete(k);
    cachedBytes -= v.bytes.length;
  }
}

async function load(id: string): Promise<Cached | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    cache.delete(id); // refresh the LRU order
    cache.set(id, hit);
    return hit;
  }
  const asset = await db.mirroredAsset.findUnique({ where: { id }, select: { bytes: true, contentType: true } });
  if (!asset) return null;
  const entry = { bytes: Buffer.from(asset.bytes), contentType: asset.contentType, at: Date.now() };
  remember(id, entry);
  return entry;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{40}$/.test(id)) return new Response("not found", { status: 404 });
  const asset = await load(id);
  if (!asset) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.length) as BodyInit, {
    headers: {
      "content-type": asset.contentType,
      // max-age for browsers, s-maxage so a shared CDN keeps it too (the id changes whenever the content does).
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "x-content-type-options": "nosniff",
      // Mirrored files are data, never documents: an SVG opened directly can't run script or load anything.
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
