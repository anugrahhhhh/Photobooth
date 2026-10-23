import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db/index.js';
import { createDeliveryQueue } from '../lib/delivery-queue.js';

let db, clock, calls, behavior, row;
const T0 = new Date('2026-10-23T00:00:00Z');
const advance = (ms) => (clock = new Date(clock.getTime() + ms));
const store = { filePath: (token, name) => `/files/${token}/${name}` };
const sender = { send: async (args) => { calls.push(args); return behavior(calls.length); } };
const mk = (extra = {}) => createDeliveryQueue({ db, store, senders: { email: sender, whatsapp: sender }, now: () => clock, ...extra });
const get = () => db.prepare('SELECT * FROM deliveries').get();

beforeEach(() => {
  db = openDb(':memory:');
  clock = T0;
  calls = [];
  behavior = () => {};
  const token = 'A'.repeat(22);
  db.prepare(
    `INSERT INTO results (token, key_hash, lang, base_url, created_at, expires_at) VALUES (?, 'h', 'en', 'http://b.test', ?, ?)`,
  ).run(token, T0.toISOString(), new Date(T0.getTime() + 7 * 864e5).toISOString());
  row = db.prepare('SELECT * FROM results').get();
});
afterEach(() => db.close());

test('sukses: sent, recipient NULL, masked terisi, argumen email benar', async () => {
  const q = mk();
  q.enqueue(row, 'email', 'rina.putri@gmail.com');
  await q.tick();
  const d = get();
  assert.equal(d.status, 'sent');
  assert.equal(d.recipient, null);
  assert.equal(d.recipient_masked, 'ri***@gmail.com');
  assert.equal(d.attempts, 1);
  assert.ok(d.sent_at);
  assert.deepEqual(calls[0], {
    to: 'rina.putri@gmail.com',
    lang: 'en',
    pageUrl: `http://b.test/p/${row.token}`,
    photoPath: `/files/${row.token}/photo.jpg`,
  });
});

test('whatsapp: photoUrl dan pageUrl', async () => {
  const q = mk();
  q.enqueue(row, 'whatsapp', '6281234567890');
  await q.tick();
  assert.deepEqual(calls[0], {
    to: '6281234567890',
    photoUrl: `http://b.test/r/${row.token}/photo.jpg`,
    pageUrl: `http://b.test/p/${row.token}`,
  });
  assert.equal(get().recipient_masked, '6281****7890');
});

test('gagal, gagal, sukses: backoff 30 dtk lalu 120 dtk', async () => {
  behavior = (n) => { if (n < 3) throw new Error('boom'); };
  const q = mk();
  q.enqueue(row, 'email', 'a@b.com');
  await q.tick();
  let d = get();
  assert.equal(d.status, 'queued');
  assert.equal(d.attempts, 1);
  assert.equal(d.next_attempt_at, new Date(T0.getTime() + 30_000).toISOString());
  await q.tick();
  assert.equal(calls.length, 1, 'belum jatuh tempo');
  advance(30_000);
  await q.tick();
  d = get();
  assert.equal(d.attempts, 2);
  assert.equal(d.next_attempt_at, new Date(clock.getTime() + 120_000).toISOString());
  advance(120_000);
  await q.tick();
  d = get();
  assert.equal(d.status, 'sent');
  assert.equal(d.attempts, 3);
  assert.equal(d.recipient, null);
});

test('selalu gagal: failed setelah 3 percobaan, recipient NULL', async () => {
  behavior = () => { throw new Error('smtp down'); };
  const q = mk();
  q.enqueue(row, 'email', 'a@b.com');
  for (let i = 0; i < 3; i++) { await q.tick(); advance(120_000); }
  const d = get();
  assert.equal(d.status, 'failed');
  assert.equal(d.attempts, 3);
  assert.equal(d.recipient, null);
  assert.equal(d.last_error, 'smtp down');
  await q.tick();
  assert.equal(calls.length, 3);
});

test('last_error tidak memuat kredensial dan dipotong 200 karakter', async () => {
  behavior = () => { throw new Error('auth failed pass=SECRETPASS ' + 'x'.repeat(300)); };
  const q = mk({ secrets: ['SECRETPASS'] });
  q.enqueue(row, 'email', 'a@b.com');
  await q.tick();
  const { last_error } = get();
  assert.ok(!last_error.includes('SECRETPASS'));
  assert.ok(last_error.includes('pass=***'));
  assert.ok(last_error.length <= 200);
});

test('send yang menggantung dianggap gagal lewat timeout', async () => {
  behavior = () => new Promise(() => {});
  const q = mk({ sendTimeoutMs: 20 });
  q.enqueue(row, 'email', 'a@b.com');
  await q.tick();
  const d = get();
  assert.equal(d.status, 'queued');
  assert.equal(d.attempts, 1);
  assert.match(d.last_error, /batas waktu/);
});

test('tick mengambil maksimal 2 baris', async () => {
  const q = mk();
  for (let i = 0; i < 3; i++) q.enqueue(row, 'email', `a${i}@b.com`);
  await q.tick();
  assert.equal(calls.length, 2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM deliveries WHERE status = 'queued'").get().n, 1);
});

test('enqueue menolak setelah 3 kiriman (429)', () => {
  const q = mk();
  for (let i = 0; i < 3; i++) q.enqueue(row, 'email', 'a@b.com');
  assert.equal(q.countFor(row.id), 3);
  assert.throws(() => q.enqueue(row, 'email', 'a@b.com'), (e) => e.status === 429);
  assert.equal(q.countFor(row.id), 3);
});

test('recover mengembalikan sending ke queued', () => {
  const q = mk();
  const id = q.enqueue(row, 'email', 'a@b.com');
  db.prepare("UPDATE deliveries SET status = 'sending' WHERE id = ?").run(id);
  q.recover();
  assert.equal(get().status, 'queued');
});

test('stats7d menghitung sent dan failed 7 hari terakhir', async () => {
  const q = mk();
  q.enqueue(row, 'email', 'a@b.com');
  await q.tick();
  behavior = () => { throw new Error('x'); };
  q.enqueue(row, 'email', 'c@d.com');
  for (let i = 0; i < 3; i++) { await q.tick(); advance(120_000); }
  assert.deepEqual(q.stats7d(), { sent: 1, failed: 1 });
  advance(8 * 864e5);
  assert.deepEqual(q.stats7d(), { sent: 0, failed: 0 });
});

test('rahasia yang melintasi batas 200 karakter tetap tersamar', async () => {
  const secret = 'SECRETPASS123';
  behavior = () => { throw new Error('x'.repeat(195) + secret); };
  const q = mk({ secrets: [secret] });
  q.enqueue(row, 'email', 'a@b.com');
  await q.tick();
  assert.ok(!get().last_error.includes(secret.slice(0, 6)));
});

test('last_error tidak memuat alamat penerima', async () => {
  behavior = () => { throw new Error('550 rejected <rina@x.com>'); };
  const q = mk();
  q.enqueue(row, 'email', 'rina@x.com');
  await q.tick();
  assert.ok(!get().last_error.includes('rina@x.com'));
});

test('batas harian global dihitung di seluruh hasil dan kanal selama 24 jam', () => {
  const q = mk({ maxPerDay: 2 });
  const token2 = 'B'.repeat(22);
  db.prepare(`INSERT INTO results (token, key_hash, lang, base_url, created_at, expires_at) VALUES (?, 'h', 'en', 'http://b.test', ?, ?)`)
    .run(token2, T0.toISOString(), new Date(T0.getTime() + 7 * 864e5).toISOString());
  const row2 = db.prepare('SELECT * FROM results WHERE token = ?').get(token2);
  q.enqueue(row, 'email', 'a@b.com');
  q.enqueue(row2, 'whatsapp', '6281234567890');
  assert.deepEqual(q.stats24h(), { count: 2, limit: 2 });
  assert.throws(() => q.enqueue(row2, 'email', 'a@b.com'), (e) => e.status === 429 && /harian/.test(e.message));
  advance(24 * 3600_000 + 1);
  assert.deepEqual(q.stats24h(), { count: 0, limit: 2 });
  q.enqueue(row2, 'email', 'a@b.com');
});

test('drain menghentikan worker dan menunggu tick yang sedang berjalan', async () => {
  let release;
  behavior = () => new Promise((r) => (release = r));
  const q = mk();
  q.enqueue(row, 'email', 'a@b.com');
  const ticking = q.tick();
  let drained = false;
  const d = q.drain(1000).then(() => (drained = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(drained, false);
  release();
  await ticking;
  await d;
  assert.equal(get().status, 'sent');
});

test('drain dibatasi waktu bila tick menggantung', async () => {
  behavior = () => new Promise(() => {});
  const q = mk({ sendTimeoutMs: 200 });
  q.enqueue(row, 'email', 'a@b.com');
  const ticking = q.tick();
  const t0 = Date.now();
  await q.drain(30);
  assert.ok(Date.now() - t0 < 150);
  await ticking;
});

test('drain tanpa tick berjalan langsung selesai', async () => {
  await mk().drain(1000);
});
