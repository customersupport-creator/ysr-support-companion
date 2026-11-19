import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const checksum = typeof zlib.crc32 === "function" ? zlib.crc32(Buffer.concat([name, data])) : crc32(Buffer.concat([name, data]));
  crc.writeUInt32BE(checksum >>> 0, 0);
  return Buffer.concat([length, name, data, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pixel(x, y, size) {
  const margin = Math.max(1, Math.floor(size * 0.08));
  if (x < margin || y < margin || x >= size - margin || y >= size - margin) return [0, 0, 0, 0];
  const nx = (x - margin) / (size - margin * 2);
  const ny = (y - margin) / (size - margin * 2);
  const ink =
    (nx > 0.28 && nx < 0.42 && ny > 0.16 && ny < 0.62) ||
    (nx > 0.58 && nx < 0.72 && ny > 0.16 && ny < 0.62) ||
    (nx > 0.4 && nx < 0.6 && ny > 0.46 && ny < 0.84);
  return ink ? [246, 243, 234, 255] : [12, 92, 76, 255];
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  const parts = [header, dir];
  images.forEach((image, index) => {
    const base = index * 16;
    dir[base] = image.size >= 256 ? 0 : image.size;
    dir[base + 1] = image.size >= 256 ? 0 : image.size;
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(image.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += image.png.length;
    parts.push(image.png);
  });
  return Buffer.concat(parts);
}

fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.mkdirSync(path.join(root, "resources"), { recursive: true });
const sizes = [16, 32, 48, 256];
const images = sizes.map((size) => ({ size, png: png(size) }));
fs.writeFileSync(path.join(root, "resources", "icon.png"), images[1].png);
fs.writeFileSync(path.join(root, "build", "icon.png"), images[3].png);
fs.writeFileSync(path.join(root, "build", "icon.ico"), ico(images));
console.log("Wrote build/icon.ico and resources/icon.png");
