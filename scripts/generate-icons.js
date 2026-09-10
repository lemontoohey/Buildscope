// Generates the two PWA icon PNGs (public/icon-192.png, public/icon-512.png)
// with zero npm dependencies — a hand-rolled PNG encoder using only Node's
// built-in zlib (for the DEFLATE compression PNG requires) and a small
// CRC32 implementation (PNG's own chunk-integrity check). Re-run this with
// `node scripts/generate-icons.js` any time the icon design needs to change
// — there's nothing else generating these files.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BRAND_BLUE = [0x4f, 0x60, 0x70]; // matches lib/theme.js COLORS.brandBlue
const WHITE = [0xff, 0xff, 0xff];

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}
const CRC_TABLE = buildCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Simple house silhouette: a triangular roof over a square body, centred,
// scaled to whatever pixel size we're asked for. Pure geometry, no fonts.
function isHousePixel(x, y, size) {
  const cx = size / 2;
  const bodyTop = size * 0.48;
  const bodyLeft = size * 0.28;
  const bodyRight = size * 0.72;
  const bodyBottom = size * 0.78;
  if (y >= bodyTop && y <= bodyBottom && x >= bodyLeft && x <= bodyRight) {
    // a small door cut-out so it reads as a house, not a box
    const doorLeft = size * 0.46;
    const doorRight = size * 0.54;
    const doorTop = size * 0.62;
    if (x >= doorLeft && x <= doorRight && y >= doorTop && y <= bodyBottom) return false;
    return true;
  }
  const roofTop = size * 0.22;
  const roofBottom = size * 0.5;
  const roofHalfWidthAt = (yy) => {
    const t = Math.max(0, Math.min(1, (yy - roofTop) / (roofBottom - roofTop)));
    return t * (size * 0.28);
  };
  if (y >= roofTop && y <= roofBottom) {
    const half = roofHalfWidthAt(y);
    if (x >= cx - half && x <= cx + half) return true;
  }
  return false;
}

function generateIcon(size) {
  const rowBytes = size * 4 + 1; // filter byte + RGBA per pixel
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isHousePixel(x, y, size) ? WHITE : BRAND_BLUE;
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = generateIcon(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}
