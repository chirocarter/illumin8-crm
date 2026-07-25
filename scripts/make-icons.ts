// Generates the app icons (amber field, white sun) as PNGs with zero
// dependencies — raw pixels + zlib + hand-built PNG chunks.
// Run: npx tsx scripts/make-icons.ts
import { deflateSync } from "zlib";
import fs from "fs";
import path from "path";

// ---- PNG plumbing ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

type PixelFn = (x: number, y: number) => [number, number, number];

function makePng(size: number, pixel: PixelFn): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = rowStart + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- The Illumin8 mark: warm amber→rose gradient field, white rising sun
// (half-disc on a horizon) with radiating rays and tip dots. ----
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Coverage of a line segment (round caps) at point p. */
function segCover(px: number, py: number, ax: number, ay: number, bx: number, by: number, half: number, aa: number) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return 1 - smooth(half - aa, half + aa, Math.sqrt(dx * dx + dy * dy));
}

function sunIcon(size: number): Buffer {
  const S = (n: number) => n * size; // fractions of the canvas
  const cx = S(0.5), cy = S(0.62);   // sun sits low, like the logo
  const sunR = S(0.175);
  const horizonHalf = S(0.012);
  const rayHalf = S(0.0135);
  const aa = size * 0.006;

  // Rays: [angle°, innerR, outerR] fanning the upper semicircle
  const rayAngles = [90, 68, 112, 46, 134, 24, 156];
  const r1 = S(0.235), r2 = S(0.315);
  const dotR = S(0.019), dotDist = S(0.365);
  const dotAngles = [90, 24, 156];

  return makePng(size, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const t = y / size;
    // amber (#f59e0b) at the top → rose/red (#c14d63) at the bottom
    const bg: [number, number, number] = [
      Math.round(lerp(245, 193, t)),
      Math.round(lerp(158, 77, t)),
      Math.round(lerp(11, 99, t)),
    ];

    const dx = px - cx, dy = py - cy;

    // Half-disc: inside radius AND above the horizon
    const dist = Math.sqrt(dx * dx + dy * dy);
    let cover = Math.min(
      1 - smooth(sunR - aa, sunR + aa, dist),
      1 - smooth(-aa, aa, dy) // dy < 0 is above the horizon line
    );

    // Horizon line
    cover = Math.max(cover, segCover(px, py, S(0.13), cy, S(0.87), cy, horizonHalf, aa));

    // Rays
    for (const deg of rayAngles) {
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a), uy = -Math.sin(a);
      cover = Math.max(cover, segCover(px, py, cx + ux * r1, cy + uy * r1, cx + ux * r2, cy + uy * r2, rayHalf, aa));
    }
    // Tip dots
    for (const deg of dotAngles) {
      const a = (deg * Math.PI) / 180;
      const ddx = dx - Math.cos(a) * dotDist;
      const ddy = dy + Math.sin(a) * dotDist;
      cover = Math.max(cover, 1 - smooth(dotR - aa, dotR + aa, Math.sqrt(ddx * ddx + ddy * ddy)));
    }

    return [
      Math.round(lerp(bg[0], 255, cover)),
      Math.round(lerp(bg[1], 255, cover)),
      Math.round(lerp(bg[2], 255, cover)),
    ];
  });
}

const pub = path.join(process.cwd(), "public");
if (!fs.existsSync(pub)) fs.mkdirSync(pub, { recursive: true });
for (const [file, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180]] as const) {
  fs.writeFileSync(path.join(pub, file), sunIcon(size));
  console.log(`wrote public/${file}`);
}
