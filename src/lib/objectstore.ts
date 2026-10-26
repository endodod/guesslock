// Optional S3-compatible object store for the bytes of mirrored media (Cloudflare R2 recommended: no egress fees).
// With MEDIA_S3_* set, new files are written there and their MirroredAsset row keeps bytes = null; without it, bytes stay
// in Postgres as before. Every byte read from Postgres counts against Neon's network transfer allowance, which is why
// they move out (`npm run media:offload` moves the existing ones). Path-style URLs: <endpoint>/<bucket>/<key>.
import { AwsClient } from "aws4fetch";

type Store = { client: AwsClient; base: string };
let store: Store | null | undefined;

function getStore(): Store | null {
  if (store !== undefined) return store;
  const endpoint = process.env.MEDIA_S3_ENDPOINT;
  const bucket = process.env.MEDIA_S3_BUCKET;
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
  store = endpoint && bucket && accessKeyId && secretAccessKey
    ? {
        client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: process.env.MEDIA_S3_REGION || "auto" }),
        base: `${endpoint.replace(/\/+$/, "")}/${bucket}/`,
      }
    : null;
  return store;
}

function need(): Store {
  const s = getStore();
  if (!s) throw new Error("object store not configured (MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY)");
  return s;
}

export function objectStoreEnabled(): boolean {
  return getStore() !== null;
}

const key = (id: string) => `media/${id}`;

export async function putObject(id: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const s = need();
  const res = await s.client.fetch(s.base + key(id), {
    method: "PUT", body: bytes as BodyInit, headers: { "content-type": contentType }, signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`object store PUT ${id}: HTTP ${res.status}`);
}

/** The stored bytes and their content type, or null when the object doesn't exist. */
export async function getObject(id: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const s = need();
  const res = await s.client.fetch(s.base + key(id), { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`object store GET ${id}: HTTP ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

export async function deleteObject(id: string): Promise<void> {
  const s = need();
  const res = await s.client.fetch(s.base + key(id), { method: "DELETE", signal: AbortSignal.timeout(30_000) });
  if (!res.ok && res.status !== 404) throw new Error(`object store DELETE ${id}: HTTP ${res.status}`);
}
