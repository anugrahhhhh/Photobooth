import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestApp } from './helpers.js';
import { HttpError } from '../lib/http-error.js';

const ctx = await makeTestApp({
  extraRoutes(app) {
    app.get('/api/__boom', () => {
      throw new Error('rahasia internal');
    });
    app.get('/api/__http', () => {
      throw new HttpError(422, 'x');
    });
  },
});
after(() => ctx.cleanup());
const { app } = ctx;

test('GET /healthz → 200 { ok: true }', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('CSP: default-src self; img-src dan media-src mengizinkan blob: data:', async () => {
  const csp = (await request(app).get('/healthz')).headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /img-src 'self' blob: data:/);
  assert.match(csp, /media-src 'self' blob: data:/);
  assert.match(csp, /script-src-attr 'none'/);
});

test('dev: CSP tanpa upgrade-insecure-requests; produksi: ada', async () => {
  const dev = (await request(app).get('/healthz')).headers['content-security-policy'];
  assert.doesNotMatch(dev, /upgrade-insecure-requests/);
  const prod = await makeTestApp({ env: { NODE_ENV: 'production', SESSION_SECRET: 'p'.repeat(40) } });
  try {
    const csp = (await request(prod.app).get('/healthz')).headers['content-security-policy'];
    assert.match(csp, /upgrade-insecure-requests/);
  } finally {
    prod.cleanup();
  }
});

test('Permissions-Policy: camera=(self), fullscreen=(self)', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.headers['permissions-policy'], 'camera=(self), fullscreen=(self)');
});

test('/uploads/templates/<file>.png tersaji dengan cache immutable', async () => {
  const key = await ctx.storage.save(Buffer.from('png-bytes'), 'png');
  const res = await request(app).get(ctx.storage.urlFor(key));
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('/uploads/templates/x.txt dan /uploads/templates/ → 404', async () => {
  fs.writeFileSync(path.join(ctx.uploadDir, 'templates', 'x.txt'), 'teks');
  assert.equal((await request(app).get('/uploads/templates/x.txt')).status, 404);
  assert.equal((await request(app).get('/uploads/templates/')).status, 404);
  assert.equal((await request(app).get('/uploads/templates')).status, 404);
});

test('/uploads/tmp/<file> → 404', async () => {
  fs.writeFileSync(path.join(ctx.storage.tmpDir, 'a.png'), 'x');
  assert.equal((await request(app).get('/uploads/tmp/a.png')).status, 404);
});

test('route yang melempar Error biasa → 500 pesan umum, tanpa stack', async (t) => {
  t.mock.method(console, 'error', () => {});
  const res = await request(app).get('/api/__boom');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Terjadi kesalahan pada server' });
});

test('route yang melempar HttpError(422, "x") → 422 { error: "x" }', async () => {
  const res = await request(app).get('/api/__http');
  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: 'x' });
});

test('/api/tidak-ada → 404 JSON', async () => {
  const res = await request(app).get('/api/tidak-ada');
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, 'string');
});

test('JSON rusak → 400 JSON', async () => {
  const res = await request(app).post('/api/x').set('Content-Type', 'application/json').send('{rusak');
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, 'string');
});
