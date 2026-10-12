import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestApp, mutate, loginAgent, templateForm, testPng, fakeJpeg, listDir, TEST_TEMPLATE } from './helpers.js';

let ctx;
let agent;
let failSaves;
beforeEach(async () => {
  failSaves = false;
  ctx = await makeTestApp({
    storage: (s) => ({
      ...s,
      save: (...a) => (failSaves ? Promise.reject(new Error('disk penuh')) : s.save(...a)),
      savePair: (...a) => (failSaves ? Promise.reject(new Error('disk penuh')) : s.savePair(...a)),
    }),
  });
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

const savedFiles = () => listDir(path.join(ctx.uploadDir, 'templates')).sort();
const row = (id) => ctx.db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
const create = async () => (await templateForm(mutate(agent.post('/api/admin/templates')))).body;
const put = (id, opts) => templateForm(mutate(agent.put(`/api/admin/templates/${id}`)), opts);
const patch = (id, status) => mutate(agent.patch(`/api/admin/templates/${id}/status`)).send({ status });
const activate = (id) => ctx.db.prepare("UPDATE templates SET status = 'active' WHERE id = ?").run(id);
const exists = (key) => fs.existsSync(path.join(ctx.uploadDir, key));
const NEW_SLOTS = JSON.stringify([{ x: 20, y: 20, w: 200, h: 150 }]);

test('PUT hanya ganti nama tanpa thumb → 200, status active tetap, file tetap', async () => {
  const t = await create();
  activate(t.id);
  const before = savedFiles();
  const res = await put(t.id, { fields: { name: 'Nama baru' }, image: null, thumb: null });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.name, 'Nama baru');
  assert.equal(res.body.status, 'active');
  assert.deepEqual(savedFiles(), before);
  assert.ok(row(t.id).updated_at >= row(t.id).created_at);
});

test('PUT ganti bg_color tanpa thumb → 422; dengan thumb → 200, status tetap, thumb lama dihapus', async () => {
  const t = await create();
  activate(t.id);
  const oldThumb = row(t.id).thumb_path;
  assert.equal((await put(t.id, { fields: { bg_color: '#000000' }, image: null, thumb: null })).status, 422);
  const res = await put(t.id, { fields: { bg_color: '#000000' }, image: null });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.bg_color, '#000000');
  assert.equal(res.body.status, 'active');
  assert.equal(exists(oldThumb), false);
  assert.equal(exists(row(t.id).thumb_path), true);
  assert.equal(savedFiles().length, 2);
});

test('PUT ganti slot tanpa thumb → 422; dengan thumb → 200, status jadi inactive', async () => {
  const t = await create();
  activate(t.id);
  assert.equal((await put(t.id, { fields: { slots: NEW_SLOTS }, image: null, thumb: null })).status, 422);
  const res = await put(t.id, { fields: { slots: NEW_SLOTS }, image: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'inactive');
  assert.equal(res.body.photo_count, 1);
});

test('PUT slot yang sama (urutan kunci beda) tidak dihitung berubah', async () => {
  const t = await create();
  activate(t.id);
  const sameSlots = JSON.stringify(TEST_TEMPLATE.slots.map(({ x, y, w, h }) => ({ h, w, y, x })));
  const res = await put(t.id, { fields: { slots: sameSlots }, image: null, thumb: null });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'active');
});

test('PUT image baru: slot divalidasi terhadap PNG baru; inactive; file lama terhapus', async () => {
  const t = await create();
  activate(t.id);
  const old = row(t.id);
  const tooBig = await put(t.id, { image: testPng(200, 200), fields: { canvas_w: '200', canvas_h: '200' } });
  assert.equal(tooBig.status, 422, 'slot lama keluar dari kanvas 200x200');
  assert.equal(row(t.id).image_path, old.image_path);

  const res = await put(t.id, {
    image: testPng(200, 200),
    fields: { canvas_w: '200', canvas_h: '200', slots: JSON.stringify([{ x: 0, y: 0, w: 200, h: 100 }]) },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'inactive');
  assert.equal(res.body.canvas_w, 200);
  assert.equal(exists(old.image_path), false);
  assert.equal(exists(old.thumb_path), false);
  assert.equal(savedFiles().length, 2);
});

test('PUT image baru tanpa canvas_w/h → 422', async () => {
  const t = await create();
  assert.equal((await put(t.id, { omit: ['canvas_w', 'canvas_h'] })).status, 422);
});

test('PUT image baru dengan ukuran tidak cocok → 422', async () => {
  const t = await create();
  assert.equal((await put(t.id, { image: testPng(200, 200) })).status, 422);
});

test('PUT id tidak ada → 404; id bukan angka → 404', async () => {
  assert.equal((await put(999, { image: null })).status, 404);
  assert.equal((await put('abc', { image: null })).status, 404);
  assert.deepEqual(listDir(ctx.storage.tmpDir), []);
});

test('PUT rollback: simpan file gagal → 500, DB tidak berubah, file lama tetap, tmp kosong', async (t) => {
  t.mock.method(console, 'error', () => {});
  const tpl = await create();
  const before = { row: row(tpl.id), files: savedFiles() };
  failSaves = true;
  const res = await put(tpl.id, { fields: { bg_color: '#000000' }, image: null });
  assert.equal(res.status, 500);
  assert.deepEqual(row(tpl.id), before.row);
  assert.deepEqual(savedFiles(), before.files);
  assert.deepEqual(listDir(ctx.storage.tmpDir), []);
});

test('PUT rollback: UPDATE DB gagal → 500, file baru dihapus, file lama tetap', async (t) => {
  t.mock.method(console, 'error', () => {});
  const tpl = await create();
  const before = { row: row(tpl.id), files: savedFiles() };
  ctx.db.exec("CREATE TRIGGER gagal BEFORE UPDATE ON templates BEGIN SELECT RAISE(ABORT, 'gagal'); END");
  const res = await put(tpl.id, {
    image: testPng(200, 200),
    fields: { canvas_w: '200', canvas_h: '200', slots: JSON.stringify([{ x: 0, y: 0, w: 200, h: 100 }]) },
  });
  assert.equal(res.status, 500);
  assert.deepEqual(row(tpl.id), before.row);
  assert.deepEqual(savedFiles(), before.files);
});

test('PATCH active dengan slot valid → 200; status tak dikenal → 422', async () => {
  const t = await create();
  const res = await patch(t.id, 'active');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'active');
  assert.equal((await patch(t.id, 'hapus')).status, 422);
  assert.equal((await mutate(agent.patch(`/api/admin/templates/${t.id}/status`)).send({})).status, 422);
});

test('PATCH active pada slots_json tidak valid di DB → 422', async () => {
  const t = await create();
  ctx.db.prepare("UPDATE templates SET slots_json = '[]' WHERE id = ?").run(t.id);
  assert.equal((await patch(t.id, 'active')).status, 422);
  ctx.db.prepare("UPDATE templates SET slots_json = 'rusak' WHERE id = ?").run(t.id);
  assert.equal((await patch(t.id, 'active')).status, 422);
  ctx.db.prepare(`UPDATE templates SET slots_json = '[{"x":0,"y":0,"w":999,"h":10}]' WHERE id = ?`).run(t.id);
  assert.equal((await patch(t.id, 'active')).status, 422);
  assert.equal(row(t.id).status, 'inactive');
});

test('PATCH archived lalu active lagi → diizinkan; inactive tidak divalidasi', async () => {
  const t = await create();
  assert.equal((await patch(t.id, 'archived')).body.status, 'archived');
  assert.equal((await patch(t.id, 'active')).body.status, 'active');
  assert.equal((await patch(t.id, 'inactive')).body.status, 'inactive');
  assert.equal((await patch(999, 'active')).status, 404);
});

test('DELETE tanpa log → 204, file terhapus; dengan log → 409, tetap ada', async () => {
  const a = await create();
  const keys = [row(a.id).image_path, row(a.id).thumb_path];
  assert.equal((await mutate(agent.delete(`/api/admin/templates/${a.id}`))).status, 204);
  assert.equal(row(a.id), undefined);
  for (const k of keys) assert.equal(exists(k), false);

  const b = await create();
  ctx.db.prepare('INSERT INTO session_logs (template_id, photo_count, created_at) VALUES (?, 2, ?)').run(b.id, new Date().toISOString());
  const res = await mutate(agent.delete(`/api/admin/templates/${b.id}`));
  assert.equal(res.status, 409);
  assert.equal(typeof res.body.error, 'string');
  assert.ok(row(b.id));
  assert.equal(exists(row(b.id).image_path), true);
  assert.equal((await mutate(agent.delete('/api/admin/templates/999'))).status, 404);
});

test('thumb tanpa perubahan visual tetap diterima dan mengganti thumb lama', async () => {
  const t = await create();
  const oldThumb = row(t.id).thumb_path;
  const res = await put(t.id, { image: null, thumb: fakeJpeg(100, 100) });
  assert.equal(res.status, 200);
  assert.notEqual(row(t.id).thumb_path, oldThumb);
  assert.equal(exists(oldThumb), false);
});
