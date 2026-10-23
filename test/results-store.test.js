import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/index.js';
import { createResultsStore, RESULT_TTL_DAYS } from '../lib/results-store.js';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF = Buffer.from('GIF89a-data');
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 9]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);

let dir, db, clock, store;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-res-'));
  db = openDb(':memory:');
  clock = new Date('2026-10-23T00:00:00Z');
  store = createResultsStore({ db, uploadDir: dir, now: () => clock });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const mk = () => store.create({ photo: JPG, templateId: 1, lang: 'id', baseUrl: 'https://x.test' });

test('TTL 7 hari', () => assert.equal(RESULT_TTL_DAYS, 7));

test('create: token, expiresAt, photo.jpg, key tidak tersimpan apa adanya', async () => {
  const { token, key, expiresAt } = await mk();
  assert.match(token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(expiresAt, '2026-10-30T00:00:00.000Z');
  assert.ok(fs.existsSync(store.filePath(token, 'photo.jpg')));
  const row = db.prepare('SELECT * FROM results').get();
  for (const v of Object.values(row)) assert.notEqual(v, key);
  assert.ok(!String(JSON.stringify(row)).includes(key));
});

test('verifyKey benar, salah, undefined', async () => {
  const { token, key } = await mk();
  const row = store.get(token);
  assert.equal(store.verifyKey(row, key), true);
  assert.equal(store.verifyKey(row, 'salah'), false);
  assert.equal(store.verifyKey(row, undefined), false);
});

test('get: token tidak valid atau tidak dikenal → null', async () => {
  assert.equal(store.get('../etc/passwd'), null);
  assert.equal(store.get('A'.repeat(22)), null);
});

test('filePath menolak token dan nama file tidak sah', async () => {
  const { token } = await mk();
  assert.throws(() => store.filePath('../x', 'photo.jpg'));
  assert.throws(() => store.filePath(token, '../photo.jpg'));
  assert.throws(() => store.filePath(token, 'evil.txt'));
});

test('addAsset gif dan video; video baru menggantikan ekstensi lain', async () => {
  const { token } = await mk();
  await store.addAsset(token, 'gif', GIF, 'gif');
  assert.equal(store.get(token).has_gif, 1);
  await store.addAsset(token, 'video', WEBM, 'webm');
  await store.addAsset(token, 'video', MP4, 'mp4');
  const d = path.dirname(store.filePath(token, 'photo.jpg'));
  assert.deepEqual(fs.readdirSync(d).sort(), ['anim.gif', 'photo.jpg', 'video.mp4']);
  const row = store.get(token);
  assert.equal(row.video_type, 'mp4');
  assert.equal(db.prepare('SELECT bytes FROM results').get().bytes, JPG.length + GIF.length + MP4.length);
});

test('expired dan cleanup menghapus folder dan deliveries', async () => {
  const { token } = await mk();
  const id = store.get(token).id;
  db.prepare(
    `INSERT INTO deliveries (result_id, channel, recipient_masked, status, next_attempt_at, created_at)
     VALUES (?, 'email', 'ri***@x.com', 'queued', ?, ?)`,
  ).run(id, clock.toISOString(), clock.toISOString());
  assert.equal(store.get(token).expired, false);
  clock = new Date('2026-10-30T00:00:01Z');
  assert.equal(store.get(token).expired, true);
  const d = path.dirname(store.filePath(token, 'photo.jpg'));
  assert.equal(await store.cleanup(), 1);
  assert.ok(!fs.existsSync(d));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM deliveries').get().c, 0);
  assert.equal(store.get(token), null);
});

test('checkDisk memakai ambang max(100MB, 15% total)', async () => {
  const mkStore = (bavail) =>
    createResultsStore({ db, uploadDir: dir, statfs: async () => ({ bsize: 4096, blocks: 262144, bavail }) });
  const low = await mkStore(20000).checkDisk();
  assert.equal(low.ok, false);
  assert.equal(low.total, 4096 * 262144);
  assert.equal(low.free, 4096 * 20000);
  assert.equal((await mkStore(200000).checkDisk()).ok, true);
});

test('summary dan removeAll', async () => {
  await mk();
  await mk();
  assert.deepEqual(store.summary(), { count: 2, bytes: JPG.length * 2 });
  await store.removeAll();
  assert.deepEqual(store.summary(), { count: 0, bytes: 0 });
  assert.equal(fs.readdirSync(path.join(dir, 'results')).length, 0);
});

test('cleanup tahan gagal per item: yang lain tetap dibersihkan, hanya yang berhasil dihitung', async () => {
  const failing = [];
  store = createResultsStore({
    db,
    uploadDir: dir,
    now: () => clock,
    remove: async (p, o) => {
      if (failing.some((f) => p.endsWith(f))) throw new Error('EBUSY');
      return fs.promises.rm(p, o);
    },
  });
  const a = await mk();
  const b = await mk();
  failing.push(a.token);
  clock = new Date('2026-10-30T00:00:01Z');
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  let n;
  try {
    n = await store.cleanup();
  } finally {
    console.warn = warn;
  }
  assert.equal(n, 1);
  assert.equal(warnings.length, 1);
  assert.ok(!fs.existsSync(path.dirname(store.filePath(b.token, 'photo.jpg'))));
  assert.ok(store.get(a.token), 'baris yang gagal dihapus tetap ada untuk dicoba lagi');
  failing.length = 0;
  assert.equal(await store.cleanup(), 1);
});
