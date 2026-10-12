import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTestApp, mutate, loginAgent, templateForm, testPng, fakeJpeg, listDir, TEST_TEMPLATE } from './helpers.js';

let ctx;
let agent;
beforeEach(async () => {
  ctx = await makeTestApp();
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

const tmpFiles = () => listDir(ctx.storage.tmpDir);
const savedFiles = () => listDir(path.join(ctx.uploadDir, 'templates'));
const post = (opts) => templateForm(mutate(agent.post('/api/admin/templates')), opts);

async function expectRejected(opts, status) {
  const res = await post(opts);
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(typeof res.body.error, 'string');
  assert.deepEqual(tmpFiles(), [], 'uploads/tmp harus kosong');
  assert.deepEqual(savedFiles(), [], 'tidak ada file tersimpan');
  return res;
}

test('POST valid → 201, inactive, photo_count dari slot, tanpa path', async () => {
  const res = await post();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const t = res.body;
  assert.equal(t.status, 'inactive');
  assert.equal(t.photo_count, 2);
  assert.equal(t.name, TEST_TEMPLATE.name);
  assert.equal(t.bg_color, TEST_TEMPLATE.bg_color);
  assert.deepEqual(t.slots, TEST_TEMPLATE.slots);
  assert.equal(t.canvas_w, 300);
  assert.equal(t.usage_count, 0);
  assert.match(t.image_url, /^\/uploads\/templates\/[0-9a-f-]+\.png$/);
  assert.match(t.thumb_url, /^\/uploads\/templates\/[0-9a-f-]+\.jpg$/);
  assert.equal('image_path' in t, false);
  assert.equal('thumb_path' in t, false);
  assert.equal(savedFiles().length, 2);
  assert.deepEqual(tmpFiles(), []);
});

test('photo_count dan status dari body diabaikan', async () => {
  const res = await post({ fields: { photo_count: '7', status: 'active' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.photo_count, 2);
  assert.equal(res.body.status, 'inactive');
});

test('tanpa thumb → 422; tanpa image → 422', async () => {
  await expectRejected({ thumb: null }, 422);
  await expectRejected({ image: null }, 422);
});

test('image bukan PNG → 400; thumb bukan JPEG → 400', async () => {
  await expectRejected({ image: fakeJpeg(300, 400) }, 400);
  await expectRejected({ thumb: testPng(10, 10) }, 400);
});

test('PNG > 5 MB → 413', async () => {
  const big = Buffer.concat([testPng(), Buffer.alloc(5 * 1024 * 1024)]);
  await expectRejected({ image: big }, 413);
});

test('thumb > 300 KB → 413; thumb 601x10 → 422', async () => {
  await expectRejected({ thumb: fakeJpeg(150, 200, { size: 300 * 1024 + 1 }) }, 413);
  await expectRejected({ thumb: fakeJpeg(601, 10) }, 422);
});

test('thumb tepat 600 px dan 300 KB diterima', async () => {
  const res = await post({ thumb: fakeJpeg(600, 450, { size: 300 * 1024 }) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('dimensi PNG ≠ canvas_w/canvas_h → 422', async () => {
  await expectRejected({ image: testPng(301, 400) }, 422);
});

test('canvas_w/h bukan bilangan bulat atau tidak ada → 422', async () => {
  await expectRejected({ fields: { canvas_w: 'abc' } }, 422);
  await expectRejected({ fields: { canvas_w: '300.5' } }, 422);
  await expectRejected({ omit: ['canvas_h'] }, 422);
});

test('slots JSON rusak / angka string / pecahan / bukan array / tidak ada → 422', async () => {
  await expectRejected({ fields: { slots: '[{x:1' } }, 422);
  await expectRejected({ fields: { slots: JSON.stringify([{ x: '10', y: 10, w: 100, h: 100 }]) } }, 422);
  await expectRejected({ fields: { slots: JSON.stringify([{ x: 10.5, y: 10, w: 100, h: 100 }]) } }, 422);
  await expectRejected({ fields: { slots: '{"x":1}' } }, 422);
  await expectRejected({ omit: ['slots'] }, 422);
});

test('slot keluar kanvas → 422; tumpang tindih → 201', async () => {
  await expectRejected({ fields: { slots: JSON.stringify([{ x: 200, y: 0, w: 200, h: 100 }]) } }, 422);
  const overlap = [
    { x: 0, y: 0, w: 200, h: 200 },
    { x: 100, y: 100, w: 150, h: 150 },
  ];
  assert.equal((await post({ fields: { slots: JSON.stringify(overlap) } })).status, 201);
});

test('slot disimpan hanya dengan x, y, w, h', async () => {
  const slots = [{ x: 10, y: 10, w: 100, h: 100, extra: 'buang' }];
  const res = await post({ fields: { slots: JSON.stringify(slots) } });
  assert.deepEqual(res.body.slots, [{ x: 10, y: 10, w: 100, h: 100 }]);
});

test('bg_color "red" → 422; name kosong setelah trim → 422; name > 100 → 422', async () => {
  await expectRejected({ fields: { bg_color: 'red' } }, 422);
  await expectRejected({ fields: { name: '   ' } }, 422);
  await expectRejected({ fields: { name: 'x'.repeat(101) } }, 422);
});

test('name di-trim dan bg_color dinormalkan huruf kecil', async () => {
  const res = await post({ fields: { name: '  Ulang Tahun  ', bg_color: '#ABCDEF' } });
  assert.equal(res.body.name, 'Ulang Tahun');
  assert.equal(res.body.bg_color, '#abcdef');
});

test('field file tak dikenal → 400', async () => {
  const res = await templateForm(mutate(agent.post('/api/admin/templates'))).attach('lain', Buffer.from('x'), 'x.bin');
  assert.equal(res.status, 400);
  assert.deepEqual(tmpFiles(), []);
  assert.deepEqual(savedFiles(), []);
});

test('urutan multipart: file sebelum dan sesudah field teks → keduanya 201', async () => {
  assert.equal((await post({ filesFirst: true })).status, 201);
  assert.equal((await post({ filesFirst: false })).status, 201);
});

test('GET /api/admin/templates → semua status dengan usage_count', async () => {
  const a = (await post()).body;
  const b = (await post()).body;
  ctx.db.prepare("UPDATE templates SET status = 'archived' WHERE id = ?").run(b.id);
  ctx.db
    .prepare('INSERT INTO session_logs (template_id, photo_count, created_at) VALUES (?, 2, ?)')
    .run(a.id, new Date().toISOString());
  const res = await agent.get('/api/admin/templates');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const byId = Object.fromEntries(res.body.map((t) => [t.id, t]));
  assert.equal(byId[a.id].usage_count, 1);
  assert.equal(byId[b.id].status, 'archived');
  for (const t of res.body) assert.equal('image_path' in t, false);
});

test('tanpa Origin → 403 dan tidak ada file tersimpan', async () => {
  const res = await templateForm(agent.post('/api/admin/templates').set('Host', 'booth.test'));
  assert.equal(res.status, 403);
  assert.deepEqual(tmpFiles(), []);
  assert.deepEqual(savedFiles(), []);
});
