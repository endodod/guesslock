// Generates public/grain.png: a tiny tiled monochrome noise texture (no dependencies).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 96, H = 96;
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const raw = Buffer.alloc((W * 2 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 2 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const o = y * (W * 2 + 1) + 1 + x * 2;
    raw[o] = Math.floor(rnd() * 256); // gray
    raw[o + 1] = Math.floor(40 + rnd() * 215); // alpha
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // gray+alpha
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../public/grain.png", import.meta.url), png);
console.log("grain.png", png.length, "bytes");
