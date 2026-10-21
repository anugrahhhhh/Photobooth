import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp, loginAgent, mutate } from './helpers.js';

const DEFAULTS = { countdown_seconds: 3, mirror_output: 0, kiosk_idle_seconds: 90, review_seconds: 3, sound_default: 1 };

let ctx;
let agent;
beforeEach(async () => {
  ctx = await makeTestApp();
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

const put = (body) => mutate(agent.put('/api/admin/settings')).send(body);
const current = async () => (await request(ctx.app).get('/api/settings')).body;

test('GET default semua pengaturan', async () => {
  assert.deepEqual(await current(), { ...DEFAULTS, kiosk_available: false });
});

test('PUT parsial → 200 dengan pengaturan lengkap; kunci lain tetap', async () => {
  const res = await put({ countdown_seconds: 5 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ...DEFAULTS, countdown_seconds: 5 });
  assert.deepEqual(await current(), { ...DEFAULTS, countdown_seconds: 5, kiosk_available: false });
  assert.equal((await put({ mirror_output: 1 })).body.mirror_output, 1);
  assert.deepEqual(await current(), { ...DEFAULTS, countdown_seconds: 5, mirror_output: 1, kiosk_available: false });
});

test('PUT kunci tak dikenal → 400, kunci valid di body yang sama tidak ditulis', async () => {
  const res = await put({ countdown_seconds: 7, warna: 'merah' });
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, 'string');
  assert.equal((await current()).countdown_seconds, 3);
});

test('PUT nilai di luar rentang atau bukan bilangan bulat → 422, tidak ada yang berubah', async () => {
  for (const body of [
    { countdown_seconds: 0 },
    { countdown_seconds: 11 },
    { countdown_seconds: 2.5 },
    { countdown_seconds: '5' },
    { mirror_output: 2 },
    { mirror_output: true },
    { mirror_output: 1, countdown_seconds: 99 },
    { kiosk_idle_seconds: 29 },
    { kiosk_idle_seconds: 601 },
    { review_seconds: -1 },
    { review_seconds: 11 },
    { sound_default: 2 },
  ]) {
    assert.equal((await put(body)).status, 422, JSON.stringify(body));
  }
  assert.deepEqual(await current(), { ...DEFAULTS, kiosk_available: false });
});

test('PUT batas bawah/atas pengaturan baru → 200', async () => {
  for (const body of [{ kiosk_idle_seconds: 30 }, { review_seconds: 0 }, { sound_default: 0 }]) {
    assert.equal((await put(body)).status, 200, JSON.stringify(body));
  }
});

test('PUT kunci prototipe → 400, pengaturan tidak berubah', async () => {
  for (const raw of ['{"toString":1}', '{"constructor":1}', '{"__proto__":1}']) {
    const res = await mutate(agent.put('/api/admin/settings')).set('Content-Type', 'application/json').send(raw);
    assert.equal(res.status, 400, raw);
  }
  assert.deepEqual(await current(), { ...DEFAULTS, kiosk_available: false });
});

test('kiosk_available true setelah PIN kiosk dipasang', async () => {
  assert.equal((await mutate(agent.put('/api/admin/kiosk-pin')).send({ pin: '1234' })).status, 204);
  assert.equal((await current()).kiosk_available, true);
});

test('PUT body bukan objek → 400', async () => {
  assert.equal((await mutate(agent.put('/api/admin/settings')).set('Content-Type', 'application/json').send('[1]')).status, 400);
});

test('PUT tanpa login → 401', async () => {
  assert.equal((await mutate(request(ctx.app).put('/api/admin/settings')).send({ countdown_seconds: 5 })).status, 401);
});
