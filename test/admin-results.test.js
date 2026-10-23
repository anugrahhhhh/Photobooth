import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestApp, loginAgent, mutate, listDir } from './helpers.js';

const THUMB = fs.readFileSync(new URL('./fixtures/thumb.jpg', import.meta.url));

const makeResult = (app) =>
  mutate(request(app).post('/api/results')).field('consent', '1').attach('photo', THUMB, 'photo.jpg');

function fakeMailer(impl) {
  const calls = [];
  return {
    calls,
    send: async () => {},
    sendTest: async (to) => {
      calls.push(to);
      return impl?.(to);
    },
  };
}

test('tanpa login: ketiga endpoint 401', async () => {
  const t = await makeTestApp();
  try {
    assert.equal((await request(t.app).get('/api/admin/results/summary')).status, 401);
    assert.equal((await mutate(request(t.app).delete('/api/admin/results'))).status, 401);
    assert.equal((await mutate(request(t.app).post('/api/admin/test-email')).send({ to: 'a@b.co' })).status, 401);
  } finally {
    t.cleanup();
  }
});

test('summary setelah 2 hasil: count 2, bytes > 0, disk dan layanan', async () => {
  const t = await makeTestApp({ senders: { email: fakeMailer() } });
  try {
    const agent = await loginAgent(t.app, t.db);
    await makeResult(t.app);
    await makeResult(t.app);
    const res = await agent.get('/api/admin/results/summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.ok(res.body.bytes > 0);
    assert.ok(res.body.disk_total > 0);
    assert.ok(res.body.disk_free > 0);
    assert.deepEqual(res.body.deliveries_7d, { sent: 0, failed: 0 });
    assert.deepEqual(res.body.services, { email: true, whatsapp: false });
  } finally {
    t.cleanup();
  }
});

test('DELETE menghapus semua hasil dan mengosongkan folder', async () => {
  const t = await makeTestApp();
  try {
    const agent = await loginAgent(t.app, t.db);
    await makeResult(t.app);
    await makeResult(t.app);
    const dir = path.join(t.uploadDir, 'results');
    assert.equal(listDir(dir).length, 2);
    assert.equal((await mutate(agent.delete('/api/admin/results'))).status, 204);
    assert.equal((await agent.get('/api/admin/results/summary')).body.count, 0);
    assert.equal(listDir(dir).length, 0);
  } finally {
    t.cleanup();
  }
});

test('test-email: alamat dinormalisasi lalu sendTest dipanggil, 204', async () => {
  const mailer = fakeMailer();
  const t = await makeTestApp({ senders: { email: mailer } });
  try {
    const agent = await loginAgent(t.app, t.db);
    const res = await mutate(agent.post('/api/admin/test-email')).send({ to: ' Rina@Gmail.com ' });
    assert.equal(res.status, 204);
    assert.deepEqual(mailer.calls, ['rina@gmail.com']);
  } finally {
    t.cleanup();
  }
});

test('test-email: tidak valid 422, email tidak aktif 409', async () => {
  const t = await makeTestApp({ senders: { email: fakeMailer() } });
  const off = await makeTestApp({ senders: {} });
  try {
    const agent = await loginAgent(t.app, t.db);
    assert.equal((await mutate(agent.post('/api/admin/test-email')).send({ to: 'bukan-email' })).status, 422);
    assert.equal((await mutate(agent.post('/api/admin/test-email')).send({})).status, 422);
    const agent2 = await loginAgent(off.app, off.db);
    assert.equal((await mutate(agent2.post('/api/admin/test-email')).send({ to: 'a@b.co' })).status, 409);
  } finally {
    t.cleanup();
    off.cleanup();
  }
});

test('test-email: galat SMTP -> 502 tanpa SMTP_PASS di body', async () => {
  const mailer = fakeMailer(() => {
    throw new Error('Invalid login: 535 … pass=rahasia');
  });
  const t = await makeTestApp({
    senders: { email: mailer },
    env: { SMTP_HOST: 'smtp.test', SMTP_PORT: '587', SMTP_USER: 'u@test.co', SMTP_PASS: 'rahasia' },
  });
  try {
    const agent = await loginAgent(t.app, t.db);
    const res = await mutate(agent.post('/api/admin/test-email')).send({ to: 'a@b.co' });
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
    assert.ok(!JSON.stringify(res.body).includes('rahasia'));
  } finally {
    t.cleanup();
  }
});
