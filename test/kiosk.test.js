import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp, loginAgent, mutate } from './helpers.js';
import { hasKioskPin, KIOSK_PIN_KEY, KIOSK_VERIFY_LIMIT } from '../routes/kiosk.js';

let ctx;
let agent;
const setPin = (body) => mutate(agent.put('/api/admin/kiosk-pin')).send(body);
const verify = (body) => mutate(request(ctx.app).post('/api/kiosk/verify')).send(body);
const storedHash = () => ctx.db.prepare('SELECT value FROM settings WHERE key = ?').get(KIOSK_PIN_KEY)?.value;

beforeEach(async () => {
  ctx = await makeTestApp();
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

test('PUT menyimpan PIN sebagai hash bcrypt', async () => {
  const res = await setPin({ pin: '1234' });
  assert.equal(res.status, 204);
  assert.equal(hasKioskPin(ctx.db), true);
  assert.ok(storedHash().startsWith('$2'));
  assert.notEqual(storedHash(), '1234');
});

test('PUT tanpa login 401, tanpa Origin 403', async () => {
  const anon = await mutate(request(ctx.app).put('/api/admin/kiosk-pin')).send({ pin: '1234' });
  assert.equal(anon.status, 401);
  const noOrigin = await agent.put('/api/admin/kiosk-pin').set('Host', 'booth.test').send({ pin: '1234' });
  assert.equal(noOrigin.status, 403);
});

test('PUT dengan PIN tidak valid 422 dan PIN lama tetap berlaku', async () => {
  assert.equal((await setPin({ pin: '1234' })).status, 204);
  for (const body of [{ pin: '123' }, { pin: '123456789' }, { pin: '12a4' }, { pin: 1234 }, { pin: ' 1234' }, {}]) {
    const res = await setPin(body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.equal(typeof res.body.error, 'string');
  }
  assert.equal((await verify({ pin: '1234' })).status, 200);
});

test('PUT pin null menghapus PIN', async () => {
  await setPin({ pin: '1234' });
  assert.equal((await setPin({ pin: null })).status, 204);
  assert.equal(hasKioskPin(ctx.db), false);
});

test('verify: PIN benar 200, salah 401, belum diatur 401', async () => {
  assert.equal((await verify({ pin: '1234' })).status, 401);
  await setPin({ pin: '1234' });
  const ok = await verify({ pin: '1234' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true });
  const bad = await verify({ pin: '4321' });
  assert.equal(bad.status, 401);
  assert.equal(typeof bad.body.error, 'string');
});

test('verify: body aneh 401, bukan 500', async () => {
  await setPin({ pin: '1234' });
  for (const body of [{ pin: 1234 }, {}, { pin: ['1234'] }]) {
    assert.equal((await verify(body)).status, 401, JSON.stringify(body));
  }
});

test('verify tanpa Origin 403', async () => {
  const res = await request(ctx.app).post('/api/kiosk/verify').set('Host', 'booth.test').send({ pin: '1234' });
  assert.equal(res.status, 403);
});

test('verify dibatasi setelah lima PIN salah', async () => {
  assert.equal(KIOSK_VERIFY_LIMIT, 5);
  await setPin({ pin: '1234' });
  for (let i = 0; i < 5; i++) assert.equal((await verify({ pin: '0000' })).status, 401);
  const res = await verify({ pin: '1234' });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers['retry-after']) > 0);
});

test('verify: PIN benar tidak dihitung ke batas', async () => {
  await setPin({ pin: '1234' });
  for (let i = 0; i < 5; i++) assert.equal((await verify({ pin: '1234' })).status, 200);
  assert.equal((await verify({ pin: '0000' })).status, 401);
});

test('GET /api/settings tidak membocorkan hash PIN', async () => {
  await setPin({ pin: '1234' });
  const res = await request(ctx.app).get('/api/settings');
  assert.equal(res.status, 200);
  assert.ok(!(KIOSK_PIN_KEY in res.body));
  assert.ok(!Object.values(res.body).some((v) => typeof v === 'string' && v.startsWith('$2')));
});
