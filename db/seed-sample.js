import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { loadConfig } from '../config.js';
import { createStorage } from '../storage/index.js';
import { openDb } from './index.js';

export const SAMPLE_TEMPLATE = {
  name: 'Contoh 3 foto',
  canvas_w: 1200,
  canvas_h: 1800,
  bg_color: '#ffffff',
  slots: [
    { x: 100, y: 100, w: 1000, h: 480 },
    { x: 100, y: 640, w: 1000, h: 480 },
    { x: 100, y: 1180, w: 1000, h: 480 },
  ],
};

export const SAMPLE_THUMB_PATH = path.join(import.meta.dirname, '..', 'test', 'fixtures', 'thumb.jpg');

const FRAME_RGBA = [0xf4, 0xc2, 0xc2, 255];
const HOLE_RGBA = [0, 0, 0, 0];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

// PNG RGBA 8-bit, filter 0 di setiap baris.
export function encodePng(width, height, pixel) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bingkai opak dengan lubang transparan di setiap slot.
export function buildSamplePng(tpl = SAMPLE_TEMPLATE) {
  return encodePng(tpl.canvas_w, tpl.canvas_h, (x, y) =>
    tpl.slots.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) ? HOLE_RGBA : FRAME_RGBA,
  );
}

export async function insertSample(db, storage, { status = 'active' } = {}) {
  const { imageKey, thumbKey } = await storage.savePair(buildSamplePng(), fs.readFileSync(SAMPLE_THUMB_PATH));
  const now = new Date().toISOString();
  const t = SAMPLE_TEMPLATE;
  try {
    return Number(
      db
        .prepare(
          `INSERT INTO templates (name, image_path, thumb_path, canvas_w, canvas_h, slots_json, photo_count, bg_color, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(t.name, imageKey, thumbKey, t.canvas_w, t.canvas_h, JSON.stringify(t.slots), t.slots.length, t.bg_color, status, now, now)
        .lastInsertRowid,
    );
  } catch (err) {
    await Promise.all([storage.remove(imageKey), storage.remove(thumbKey)]);
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const id = await insertSample(db, createStorage(config.uploadDir));
  db.close();
  console.log(`Template contoh dibuat (id ${id}, aktif).`);
}
