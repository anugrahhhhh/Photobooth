import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp } from './helpers.js';
import { insertSample } from '../db/seed-sample.js';
import { SESSION_LOG_LIMIT } from '../routes/stats.js';

let ctx;
beforeEach(async () => {
  ctx = await makeTestApp();
});
afterEach(() => ctx.cleanup());

const logs = () => ctx.db.prepare('SELECT * FROM session_logs').all();

test('daftar publik hanya active, urut terbaru, tanpa path', async () => {
  const active1 = await insertSample(ctx.db, ctx.storage);
  await insertSample(ctx.db, ctx.storage, { status: 'inactive' });
  await insertSample(ctx.db, ctx.storage, { status: 'archived' });
  const active2 = await insertSample(ctx.db, ctx.storage);
  const res = await request(ctx.app).get('/api/templates');
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.map((t) => t.id),
    [active2, active1],
  );
  const t = res.body[0];
  assert.deepEqual(Object.keys(t).sort(), ['bg_color', 'canvas_h', 'canvas_w', 'id', 'image_url', 'name', 'slots', 'thumb_url']);
  assert.match(t.image_url, /^\/uploads\/templates\//);
  assert.equal(t.slots.length, 3);
});

test('detail active → 200; inactive → 404; id bukan angka → 404', async () => {
  const a = await insertSample(ctx.db, ctx.storage);
  const b = await insertSample(ctx.db, ctx.storage, { status: 'inactive' });
  const ok = await request(ctx.app).get(`/api/templates/${a}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.id, a);
  assert.equal('status' in ok.body, false);
  assert.equal((await request(ctx.app).get(`/api/templates/${b}`)).status, 404);
  assert.equal((await request(ctx.app).get('/api/templates/abc')).status, 404);
  assert.equal((await request(ctx.app).get('/api/templates/999')).status, 404);
});

test('POST /api/sessions: photo_count dari server walau body mengirim 99', async () => {
  const id = await insertSample(ctx.db, ctx.storage);
  const res = await request(ctx.app).post('/api/sessions').send({ template_id: id, photo_count: 99 });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { ok: true });
  const [log] = logs();
  assert.equal(log.template_id, id);
  assert.equal(log.photo_count, 3);
  assert.match(log.created_at, /^\d{4}-\d\d-\d\dT.*Z$/);
});

test('POST /api/sessions: template inactive/tidak ada → 422; template_id bukan bilangan bulat → 422', async () => {
  const inactive = await insertSample(ctx.db, ctx.storage, { status: 'inactive' });
  for (const body of [{ template_id: inactive }, { template_id: 999 }, { template_id: 'abc' }, { template_id: 1.5 }, {}]) {
    const res = await request(ctx.app).post('/api/sessions').send(body);
    assert.equal(res.status, 422, JSON.stringify(body));
  }
  assert.equal((await request(ctx.app).post('/api/sessions')).status, 422);
  assert.equal(logs().length, 0);
});

test(`POST /api/sessions ke-${SESSION_LOG_LIMIT + 1} dalam 10 menit → 429`, async () => {
  assert.equal(SESSION_LOG_LIMIT, 120);
  const id = await insertSample(ctx.db, ctx.storage);
  for (let i = 0; i < SESSION_LOG_LIMIT; i++) {
    assert.equal((await request(ctx.app).post('/api/sessions').send({ template_id: id })).status, 201);
  }
  const res = await request(ctx.app).post('/api/sessions').send({ template_id: id });
  assert.equal(res.status, 429);
  assert.equal(typeof res.body.error, 'string');
});

test('GET /api/settings publik tanpa login', async () => {
  const res = await request(ctx.app).get('/api/settings');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    countdown_seconds: 3,
    mirror_default: 1,
    kiosk_idle_seconds: 90,
    review_seconds: 3,
    sound_default: 1,
    contact_before: 0,
    video_enabled: 0,
    kiosk_available: false,
    share_email: false,
    share_whatsapp: false,
  });
});
