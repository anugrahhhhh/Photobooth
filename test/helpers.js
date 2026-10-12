import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { createStorage } from '../storage/index.js';
import { createApp } from '../server.js';

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
