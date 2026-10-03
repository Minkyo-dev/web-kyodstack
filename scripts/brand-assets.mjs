// Brand assets from the master logo (ADR 0045). Run: node scripts/brand-assets.mjs
// Source: public/web-kyodstack-logo.png (1254² RGBA, transparent background). Re-run after the logo changes.
import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "public/web-kyodstack-logo.png";
const INK = { r: 0x1b, g: 0x20, b: 0x29 };
const ON_DARK_INK = { r: 0xf4, g: 0xf7, b: 0xfa };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** The mark trimmed to its content, centered on a transparent square. */
async function squareMark() {
  const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const side = Math.max(trimmed.info.width, trimmed.info.height);
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed.data, gravity: "center" }])
    .png()
    .toBuffer();
}

/** The mark at `size`, inset by `pad` (share of the side) on a background (transparent when null), optionally rounded. */
async function tile(mark, size, { pad = 0, background = null, radius = 0 } = {}) {
  const inner = Math.round(size * (1 - 2 * pad));
  const art = await sharp(mark).resize(inner, inner).toBuffer();
  let base = sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: art, gravity: "center" }]);
  let out = await base.png().toBuffer();
  if (radius > 0) {
    const r = Math.round(size * radius);
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`);
    out = await sharp(out).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }
  return out;
}

/** The ink parts turned light for dark surfaces; the two blues stay. */
async function onDark(mark) {
  const { data, info } = await sharp(mark).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const near = Math.abs(data[i] - INK.r) + Math.abs(data[i + 1] - INK.g) + Math.abs(data[i + 2] - INK.b) < 60;
    if (data[i + 3] > 0 && near) {
      data[i] = ON_DARK_INK.r;
      data[i + 1] = ON_DARK_INK.g;
      data[i + 2] = ON_DARK_INK.b;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

/** A monochrome white silhouette (notification badge: Android uses only the alpha). */
async function silhouette(mark, size) {
  const { data, info } = await sharp(await tile(mark, size, { pad: 0.08 })).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 255;
  return sharp(data, { raw: info }).png().toBuffer();
}

/** .ico with embedded PNGs (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const mark = await squareMark();
await mkdir("public/brand", { recursive: true });
await mkdir("public/icons", { recursive: true });

// In-app marks: original colors for light surfaces, light ink for dark surfaces.
await writeFile("public/brand/logo-mark.png", await tile(mark, 256));
await writeFile("public/brand/logo-mark-on-dark.png", await tile(await onDark(mark), 256));

// Favicon: the logo's true colors on a white rounded tile, readable on light and dark tab strips.
const fav = (size) => tile(mark, size, { pad: 0.1, background: WHITE, radius: 0.22 });
await writeFile("src/app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await fav(size) })))));
await writeFile("src/app/icon.png", await fav(512));

// Installed app (ADR 0043): opaque white squares; maskable keeps the mark inside the 80% safe zone.
await writeFile("public/icons/apple-touch-icon.png", await tile(mark, 180, { pad: 0.12, background: WHITE }));
await writeFile("public/icons/icon-192.png", await tile(mark, 192, { pad: 0.1, background: WHITE }));
await writeFile("public/icons/icon-512.png", await tile(mark, 512, { pad: 0.1, background: WHITE }));
await writeFile("public/icons/icon-maskable-512.png", await tile(mark, 512, { pad: 0.2, background: WHITE }));
await writeFile("public/icons/badge-72.png", await silhouette(mark, 72));
console.log("brand assets written");
