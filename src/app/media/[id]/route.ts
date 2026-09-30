// Serves mirrored images/audio from Postgres. Ids are content-addressed by source URL: cache forever.
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{40}$/.test(id)) return new Response("not found", { status: 404 });
  const asset = await db.mirroredAsset.findUnique({ where: { id }, select: { bytes: true, contentType: true } });
  if (!asset) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
