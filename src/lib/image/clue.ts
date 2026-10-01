// Clue images rendered on the server, stored as their own mirrored assets under salted, per-puzzle ids.
//
// Why: catalog icons and portraits are served as /media/sha1(url). A clue that reuses that URL can be matched against
// the guess list (the same icon) or a table of sha1(public URL), and a CSS blur, zoom or tile cover is undone with the
// dev tools. So each reveal step is its own image (cropped, blurred, covered or cut out to a silhouette), named by
// sha1(salt + puzzle + step): the browser only ever holds what that step shows.
import { createHash } from "node:crypto";
import { db } from "../db";
import { config } from "../config";
import { storeAsset } from "../media";
import { decodePng, encodePng, silhouette, type Rgba } from "./png";

export type CropStep = { zoom: number; originX: number; originY: number };

/** Server-side clue image operations (BuildCtx.images). Each returns /media/<id> URLs, or null when the source can't be used. */
export interface ClueImages {
  /** A salted copy (no reveal steps), so the clue never shares a URL with the catalog. */
  copy(url: string, tag: string): Promise<string | null>;
  silhouette(url: string, tag: string): Promise<string | null>;
  /**
   * One crop per step (The Visage's zoom-out): the visible part only, so the rest can't be uncovered. Silhouettes: the
   * origin is moved onto the shape's top outline, so even the tightest crop shows an edge.
   */
  crops(url: string, steps: CropStep[], tag: string, opts?: { silhouette?: boolean }): Promise<string[] | null>;
  /** One blurred copy per radius (px at 256 px width). 0 = a sharp copy. */
  blurs(url: string, radii: number[], tag: string): Promise<string[] | null>;
  /** One copy per step with the listed tiles of a grid × grid cover painted over. */
  tiles(url: string, grid: number, covered: number[][], tag: string): Promise<string[] | null>;
}

const MEDIA = /^\/media\/([a-f0-9]{40})$/;

function derivedId(tag: string, sourceId: string, op: string): string {
  return createHash("sha1").update(`clue:${config.salt}:${tag}:${sourceId}:${op}`).digest("hex");
}

async function load(url: string): Promise<{ id: string; img: Rgba } | null> {
  const m = MEDIA.exec(url);
  if (!m) return null;
  const row = await db.mirroredAsset.findUnique({ where: { id: m[1] }, select: { bytes: true } });
  if (!row) return null;
  try {
    return { id: m[1], img: decodePng(row.bytes) };
  } catch {
    return null; // not a PNG we can read: the mode falls back or skips the candidate
  }
}

async function save(tag: string, sourceId: string, op: string, img: Rgba): Promise<string> {
  const id = derivedId(tag, sourceId, op);
  // The source URL column must be unique; it is never sent to players.
  await storeAsset(id, `derived:${id}`, encodePng(img), "image/png");
  return `/media/${id}`;
}

/** Bounding box of the opaque pixels. */
export function opaqueBox(img: Rgba): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * For a silhouette: the origin moved onto the shape's outline. originX picks a column across the shape; the origin sits
 * where that column first meets the shape, so the crop straddles the edge between shape and background.
 */
export function outlineOrigin(img: Rgba, originX: number): { originX: number; originY: number } {
  const box = opaqueBox(img);
  if (!box) return { originX, originY: 50 };
  const x = Math.round(box.x0 + ((box.x1 - box.x0) * originX) / 100);
  let y = box.y0;
  while (y < box.y1 && img.data[(y * img.width + x) * 4 + 3] === 0) y++;
  return { originX: Math.round((x / img.width) * 100), originY: Math.round((y / img.height) * 100) };
}

export function crop(img: Rgba, { zoom, originX, originY }: CropStep): Rgba {
  // The same window CSS `transform: scale(zoom)` with `transform-origin: originX% originY%` shows.
  const w = Math.max(1, Math.round(img.width / zoom)), h = Math.max(1, Math.round(img.height / zoom));
  const ox = (originX / 100) * img.width, oy = (originY / 100) * img.height;
  const x0 = Math.min(img.width - w, Math.max(0, Math.round(ox - (ox * w) / img.width)));
  const y0 = Math.min(img.height - h, Math.max(0, Math.round(oy - (oy * h) / img.height)));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data };
}

/** Three box-blur passes (close to a Gaussian), alpha-weighted so transparent edges don't darken. */
export function blur(img: Rgba, radius: number): Rgba {
  const r = Math.round(radius * (img.width / 256));
  if (r < 1) return img;
  const { width: w, height: h } = img;
  // Premultiplied floats
  let cur = new Float32Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    cur[i] = img.data[i] * a; cur[i + 1] = img.data[i + 1] * a; cur[i + 2] = img.data[i + 2] * a; cur[i + 3] = img.data[i + 3];
  }
  const pass = (src: Float32Array, horizontal: boolean) => {
    const dst = new Float32Array(src.length);
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      const at = (k: number) => (horizontal ? (line * w + k) * 4 : (k * w + line) * 4);
      const sum = [0, 0, 0, 0];
      for (let k = -r; k <= r; k++) { const p = at(Math.min(len - 1, Math.max(0, k))); for (let c = 0; c < 4; c++) sum[c] += src[p + c]; }
      for (let k = 0; k < len; k++) {
        const p = at(k);
        for (let c = 0; c < 4; c++) dst[p + c] = sum[c] / (2 * r + 1);
        const add = at(Math.min(len - 1, k + r + 1)), sub = at(Math.max(0, k - r));
        for (let c = 0; c < 4; c++) sum[c] += src[add + c] - src[sub + c];
      }
    }
    return dst;
  };
  for (let i = 0; i < 3; i++) cur = pass(pass(cur, true), false);
  const data = new Uint8Array(img.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = cur[i + 3];
    const k = a > 0 ? 255 / a : 0;
    data[i] = Math.min(255, cur[i] * k); data[i + 1] = Math.min(255, cur[i + 1] * k); data[i + 2] = Math.min(255, cur[i + 2] * k); data[i + 3] = Math.min(255, a);
  }
  return { width: w, height: h, data };
}

/** Paints the listed tiles of a grid × grid cover in the Sigil's tile colour. */
export function cover(img: Rgba, grid: number, tiles: number[]): Rgba {
  const data = new Uint8Array(img.data);
  for (const t of tiles) {
    const tx = t % grid, ty = Math.floor(t / grid);
    const x0 = Math.floor((tx * img.width) / grid), x1 = Math.floor(((tx + 1) * img.width) / grid);
    const y0 = Math.floor((ty * img.height) / grid), y1 = Math.floor(((ty + 1) * img.height) / grid);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * img.width + x) * 4;
        data[p] = 0x2a; data[p + 1] = 0x24; data[p + 2] = 0x1e; data[p + 3] = 255;
      }
  }
  return { width: img.width, height: img.height, data };
}

export const clueImages: ClueImages = {
  async copy(url, tag) {
    const src = await load(url);
    return src ? save(tag, src.id, "copy", src.img) : null;
  },
  async silhouette(url, tag) {
    const src = await load(url);
    const s = src && silhouette(src.img);
    return s ? save(tag, src.id, "silhouette", s) : null;
  },
  async crops(url, steps, tag, opts = {}) {
    const src = await load(url);
    if (!src) return null;
    const base = opts.silhouette ? silhouette(src.img) : src.img;
    if (!base) return null;
    const at = (s: CropStep): CropStep => (opts.silhouette ? { zoom: s.zoom, ...outlineOrigin(base, s.originX) } : s);
    return Promise.all(steps.map(at).map((s) => save(tag, src.id, `crop:${opts.silhouette ? "s" : ""}:${s.zoom}:${s.originX}:${s.originY}`, crop(base, s))));
  },
  async blurs(url, radii, tag) {
    const src = await load(url);
    if (!src) return null;
    return Promise.all(radii.map((r) => save(tag, src.id, `blur:${r}`, blur(src.img, r))));
  },
  async tiles(url, grid, covered, tag) {
    const src = await load(url);
    if (!src) return null;
    return Promise.all(covered.map((c) => save(tag, src.id, `tiles:${grid}:${[...c].sort((a, b) => a - b).join(",")}`, cover(src.img, grid, c))));
  },
};
