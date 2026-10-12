import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp, mutate, loginAgent, ADMIN } from './helpers.js';
import { seedAdmin } from '../db/seed-admin.js';

let ctx;
beforeEach(async () => {
  ctx = await makeTestApp();
});
afterEach(() => ctx.cleanup());

const login = (body, agent = request(ctx.app)) => mutate(agent.post('/api/auth/login')).send(body);

test('login benar → 200, /me → 200 { username: "admin" }', async () => {
  const agent = await loginAgent(ctx.app, ctx.db);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { username: 'admin' });
});

test('password salah dan username tak ada → 401 dengan pesan yang sama persis', async () => {
  await seedAdmin(ctx.db, ADMIN);
  const wrongPass = await login({ username: 'admin', password: 'salah12345' });
  const noUser = await login({ username: 'siapa', password: 'salah12345' });
  assert.equal(wrongPass.status, 401);
  assert.equal(noUser.status, 401);
  assert.deepEqual(wrongPass.body, noUser.body);
});

test('body login bukan string atau kosong → 401, bukan 500', async () => {
  await seedAdmin(ctx.db, ADMIN);
  assert.equal((await login({ username: ['admin'], password: {} })).status, 401);
  assert.equal((await login({})).status, 401);
  assert.equal((await mutate(request(ctx.app).post('/api/auth/login'))).status, 401);
});

test('percobaan ke-6 dalam 15 menit → 429 dengan Retry-After', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login({ username: 'x', password: 'y' })).status, 401);
  const res = await login({ username: 'x', password: 'y' });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers['retry-after']) > 0);
  assert.equal(typeof res.body.error, 'string');
});

test('/me tanpa login → 401', async () => {
  const res = await request(ctx.app).get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(typeof res.body.error, 'string');
});

test('logout → /me berikutnya 401', async () => {
  const agent = await loginAgent(ctx.app, ctx.db);
  assert.equal((await mutate(agent.post('/api/auth/logout'))).status, 204);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('login tanpa Origin → 403; Origin lain → 403', async () => {
  await seedAdmin(ctx.db, ADMIN);
  const noOrigin = await request(ctx.app).post('/api/auth/login').set('Host', 'booth.test').send(ADMIN);
  assert.equal(noOrigin.status, 403);
  const evil = await request(ctx.app)
    .post('/api/auth/login')
    .set('Host', 'booth.test')
    .set('Origin', 'http://evil.test')
    .send(ADMIN);
  assert.equal(evil.status, 403);
  const badPort = await request(ctx.app)
    .post('/api/auth/login')
    .set('Host', 'booth.test')
    .set('Origin', 'http://booth.test:8080')
    .send(ADMIN);
  assert.equal(badPort.status, 403);
});

test('Origin tidak valid ("null") → 403', async () => {
  const res = await request(ctx.app).post('/api/auth/login').set('Host', 'booth.test').set('Origin', 'null').send(ADMIN);
  assert.equal(res.status, 403);
});

test('/api/auth/me memakai Cache-Control: no-store', async () => {
  const res = await request(ctx.app).get('/api/auth/me');
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('cookie sesi HttpOnly dan SameSite=Lax, tidak Secure di luar produksi', async () => {
  await seedAdmin(ctx.db, ADMIN);
  const res = await login(ADMIN);
  const cookie = res.headers['set-cookie'].join(';');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.doesNotMatch(cookie, /Secure/i);
});

test('session id berganti setiap login (regenerate) dan sesi lama dihapus', async () => {
  await seedAdmin(ctx.db, ADMIN);
  const agent = request.agent(ctx.app);
  await login(ADMIN, agent);
  const first = ctx.db.prepare('SELECT sid FROM sessions').all().map((r) => r.sid);
  await login(ADMIN, agent);
  const second = ctx.db.prepare('SELECT sid FROM sessions').all().map((r) => r.sid);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0], second[0]);
});

test('GET /api/admin/templates tanpa login → 401', async () => {
  assert.equal((await request(ctx.app).get('/api/admin/templates')).status, 401);
});

test('admin: mutasi tanpa Origin → 403 walau sudah login', async () => {
  const agent = await loginAgent(ctx.app, ctx.db);
  const res = await agent.post('/api/admin/anything').set('Host', 'booth.test');
  assert.equal(res.status, 403);
});
