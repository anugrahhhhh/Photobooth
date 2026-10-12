import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp, loginAgent, mutate } from './helpers.js';

let ctx;
let agent;
beforeEach(async () => {
  ctx = await makeTestApp();
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

const put = (body) => mutate(agent.put('/api/admin/settings')).send(body);
const current = async () => (await request(ctx.app).get('/api/settings')).body;

test('GET default { countdown_seconds: 3, mirror_output: 0 }', async () => {
  assert.deepEqual(await current(), { countdown_seconds: 3, mirror_output: 0 });
});

test('PUT parsial → 200 dengan pengaturan lengkap; kunci lain tetap', async () => {
  const res = await put({ countdown_seconds: 5 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { countdown_seconds: 5, mirror_output: 0 });
  assert.deepEqual(await current(), { countdown_seconds: 5, mirror_output: 0 });
  assert.equal((await put({ mirror_output: 1 })).body.mirror_output, 1);
  assert.deepEqual(await current(), { countdown_seconds: 5, mirror_output: 1 });
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
  ]) {
    assert.equal((await put(body)).status, 422, JSON.stringify(body));
  }
  assert.deepEqual(await current(), { countdown_seconds: 3, mirror_output: 0 });
});

test('PUT body bukan objek → 400', async () => {
  assert.equal((await mutate(agent.put('/api/admin/settings')).set('Content-Type', 'application/json').send('[1]')).status, 400);
});

test('PUT tanpa login → 401', async () => {
  assert.equal((await mutate(request(ctx.app).put('/api/admin/settings')).send({ countdown_seconds: 5 })).status, 401);
});
