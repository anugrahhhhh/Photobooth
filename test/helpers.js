import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { createStorage } from '../storage/index.js';
import { createApp } from '../server.js';
import { encodePng } from '../db/seed-sample.js';

export const HOST = 'booth.test';
export const ORIGIN = 'http://booth.test';

// Header Host + Origin yang cocok, untuk request yang mengubah data.
export function mutate(req) {
  return req.set('Host', HOST).set('Origin', ORIGIN);
}

export async function makeTestApp({ env = {}, storage: wrapStorage, ...opts } = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-app-'));
  const config = loadConfig({ NODE_ENV: 'test', ...env, UPLOAD_DIR: uploadDir });
  const db = openDb(':memory:');
  const baseStorage = createStorage(uploadDir);
  const storage = wrapStorage ? wrapStorage(baseStorage) : baseStorage;
  const app = createApp({ config, db, storage, ...opts });
  return {
    app,
    db,
    storage,
    uploadDir,
    cleanup() {
      db.close();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

export const ADMIN = { username: 'admin', password: 'password123' };

// Membuat admin lalu login; mengembalikan agent yang membawa cookie sesi.
export async function loginAgent(app, db) {
  const { default: request } = await import('supertest');
  const { seedAdmin } = await import('../db/seed-admin.js');
  if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(ADMIN.username)) await seedAdmin(db, ADMIN);
  const agent = request.agent(app);
  const res = await mutate(agent.post('/api/auth/login')).send(ADMIN);
  if (res.status !== 200) throw new Error(`login gagal: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

function jpegSegment(marker, payload) {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}

// Header JPEG minimal (APP0 + segmen sebelum SOF + SOF + SOS), diisi nol hingga `size`.
export function fakeJpeg(width, height, { sof = 0xc0, before = [], size } = {}) {
  const sofPayload = Buffer.alloc(9);
  sofPayload[0] = 8;
  sofPayload.writeUInt16BE(height, 1);
  sofPayload.writeUInt16BE(width, 3);
  sofPayload[5] = 1;
  const head = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    ...before.map(([marker, payload]) => jpegSegment(marker, payload)),
    jpegSegment(sof, sofPayload),
    Buffer.from([0xff, 0xda, 0x00, 0x02]),
  ]);
  return size && size > head.length ? Buffer.concat([head, Buffer.alloc(size - head.length)]) : head;
}

export const TEST_TEMPLATE = {
  name: 'Strip uji',
  canvas_w: 300,
  canvas_h: 400,
  bg_color: '#ffeedd',
  slots: [
    { x: 10, y: 10, w: 280, h: 180 },
    { x: 10, y: 210, w: 280, h: 180 },
  ],
};

const pngCache = new Map();
export function testPng(w = TEST_TEMPLATE.canvas_w, h = TEST_TEMPLATE.canvas_h) {
  const key = `${w}x${h}`;
  if (!pngCache.has(key)) pngCache.set(key, encodePng(w, h, () => [200, 100, 100, 255]));
  return pngCache.get(key);
}

// Request multipart template. File dikirim sebelum field teks bila filesFirst.
// image/thumb: undefined = default valid, null = tidak dikirim.
export function templateForm(req, { fields = {}, image, thumb, filesFirst = false, omit = [] } = {}) {
  const f = {
    name: TEST_TEMPLATE.name,
    canvas_w: String(TEST_TEMPLATE.canvas_w),
    canvas_h: String(TEST_TEMPLATE.canvas_h),
    bg_color: TEST_TEMPLATE.bg_color,
    slots: JSON.stringify(TEST_TEMPLATE.slots),
    ...fields,
  };
  const addFields = () => {
    for (const [k, v] of Object.entries(f)) if (!omit.includes(k)) req = req.field(k, v);
  };
  const addFiles = () => {
    if (image !== null) req = req.attach('image', image ?? testPng(), 'template.png');
    if (thumb !== null) req = req.attach('thumb', thumb ?? fakeJpeg(150, 200), 'thumb.jpg');
  };
  if (filesFirst) {
    addFiles();
    addFields();
  } else {
    addFields();
    addFiles();
  }
  return req;
}

export function listDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}
