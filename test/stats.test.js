import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeTestApp, loginAgent } from './helpers.js';
import { insertSample } from '../db/seed-sample.js';

let ctx;
let agent;
beforeEach(async () => {
  ctx = await makeTestApp({ now: () => new Date('2026-10-12T18:30:00Z') });
  agent = await loginAgent(ctx.app, ctx.db);
});
afterEach(() => ctx.cleanup());

const log = (templateId, createdAt) =>
  ctx.db.prepare('INSERT INTO session_logs (template_id, photo_count, created_at) VALUES (?, 3, ?)').run(templateId, createdAt);

test('stats tanpa login → 401', async () => {
  assert.equal((await request(ctx.app).get('/api/admin/stats')).status, 401);
});

test('stats: jumlah template per status', async () => {
  await insertSample(ctx.db, ctx.storage);
  await insertSample(ctx.db, ctx.storage, { status: 'inactive' });
  await insertSample(ctx.db, ctx.storage, { status: 'inactive' });
  const res = await agent.get('/api/admin/stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.templates, { active: 1, inactive: 2, archived: 0 });
});

test('stats: sessions_today memakai batas hari Asia/Jakarta', async () => {
  const id = await insertSample(ctx.db, ctx.storage);
  log(id, '2026-10-12T17:00:00.000Z'); // 00:00 WIB tanggal 13 → hari ini
  log(id, '2026-10-13T16:59:59.999Z'); // 23:59 WIB tanggal 13 → hari ini
  log(id, '2026-10-12T16:59:59.999Z'); // 23:59 WIB tanggal 12 → kemarin
  log(id, '2026-10-13T17:00:00.000Z'); // besok
  const res = await agent.get('/api/admin/stats');
  assert.equal(res.body.sessions_today, 2);
});

test('stats: top 5 urut count menurun, memuat template arsip', async () => {
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(await insertSample(ctx.db, ctx.storage));
  ctx.db.prepare("UPDATE templates SET status = 'archived', name = 'Lama' WHERE id = ?").run(ids[5]);
  const counts = [1, 2, 3, 4, 5, 6];
  ids.forEach((id, i) => {
    for (let n = 0; n < counts[i]; n++) log(id, '2026-01-01T00:00:00.000Z');
  });
  const res = await agent.get('/api/admin/stats');
  assert.equal(res.body.top.length, 5);
  assert.deepEqual(res.body.top[0], { id: ids[5], name: 'Lama', count: 6 });
  assert.deepEqual(
    res.body.top.map((t) => t.count),
    [6, 5, 4, 3, 2],
  );
});
