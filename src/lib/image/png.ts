// Minimal PNG codec (no dependencies): decodes 8-bit, non-interlaced PNGs to RGBA and encodes RGBA.
// Enough for the API's portraits and curated cut-outs, which The Shadow and The Arsenal turn into silhouettes.
import { deflateSync, inflateSync } from "node:zlib";

export type Rgba = { width: number; height: number; data: Uint8Array };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && Buffer.from(bytes.subarray(0, 8)).equals(SIGNATURE);
}

export function decodePng(input: Uint8Array): Rgba {
  const buf = Buffer.from(input);
  if (!isPng(buf)) throw new Error("not a PNG");
  let pos = 8;
  let width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  let palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; color = body[9]; interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
  }
  if (depth !== 8 || interlace !== 0 || !(color in CHANNELS)) throw new Error(`unsupported PNG (depth ${depth}, color ${color}, interlace ${interlace})`);
  if (width <= 0 || height <= 0 || width * height > 16_000_000) throw new Error("bad PNG size");
  const ch = CHANNELS[color];
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("truncated PNG");
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[out + x - ch] : 0;
      const b = y > 0 ? px[out - stride + x] : 0;
      const c = x >= ch && y > 0 ? px[out - stride + x - ch] : 0;
      const v = raw[src + x];
      let r: number;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      px[out + x] = r & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (color === 6) data.set(px.subarray(i * 4, i * 4 + 4), o);
    else if (color === 2) { data[o] = px[i * 3]; data[o + 1] = px[i * 3 + 1]; data[o + 2] = px[i * 3 + 2]; data[o + 3] = 255; }
    else if (color === 0) { data[o] = data[o + 1] = data[o + 2] = px[i]; data[o + 3] = 255; }
    else if (color === 4) { data[o] = data[o + 1] = data[o + 2] = px[i * 2]; data[o + 3] = px[i * 2 + 1]; }
    else {
      const k = px[i];
      if (!palette || k * 3 + 2 >= palette.length) throw new Error("bad PNG palette");
      data[o] = palette[k * 3]; data[o + 1] = palette[k * 3 + 1]; data[o + 2] = palette[k * 3 + 2];
      data[o + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng({ width, height, data }: Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * A silhouette: every pixel takes one flat colour, its opacity hardened from the source alpha, so the shape stays but no
 * colour, texture or face survives. Returns null when the image has no transparency (nothing to cut out).
 */
export function silhouette(img: Rgba, rgb: [number, number, number] = [16, 14, 12]): Rgba | null {
  const out = new Uint8Array(img.data.length);
  let transparent = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a < 250) transparent++;
    out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2];
    out[i + 3] = a < 96 ? 0 : 255;
  }
  // A cut-out needs a real background: at least 5% of the pixels transparent.
  if (transparent < (img.data.length / 4) * 0.05) return null;
  return { width: img.width, height: img.height, data: out };
}
