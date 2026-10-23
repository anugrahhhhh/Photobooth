import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestApp, mutate, listDir } from './helpers.js';

const THUMB = fs.readFileSync(new URL('./fixtures/thumb.jpg', import.meta.url));
const GIF = Buffer.from('GIF89a-data-data');
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const START = new Date('2026-10-23T00:00:00Z');

let t, clock;
before(async () => {
  clock = START;
  t = await makeTestApp({ now: () => clock });
});
after(() => t.cleanup());

const resultsDir = () => path.join(t.uploadDir, 'results');
const post = (photo = THUMB, fields = { consent: '1', lang: 'id' }) => {
  let req = mutate(request(t.app).post('/api/results'));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return photo ? req.attach('photo', photo, 'photo.jpg') : req;
};
const create = async () => (await post()).body;
const putAsset = (token, key, kind, body, type) => {
  let req = mutate(request(t.app).put(`/api/results/${token}/${kind}`)).set('Content-Type', type);
  if (key) req = req.set('X-Result-Key', key);
  return req.send(body);
};

test('POST membuat hasil dan url berakhiran /p/<token>', async () => {
  const res = await post();
  assert.equal(res.status, 201);
  assert.match(res.body.token, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(res.body.key);
  assert.equal(res.body.url, `http://booth.test/p/${res.body.token}`);
  assert.ok(res.body.expires_at);
});

test('POST ditolak: tanpa consent 422, PNG 422, tanpa foto 422, tanpa Origin 403; tanpa sisa folder', async () => {
  const before = listDir(resultsDir()).length;
  assert.equal((await post(THUMB, { lang: 'id' })).status, 422);
  assert.equal((await post(PNG)).status, 422);
  assert.equal((await post(null)).status, 422);
  const noOrigin = await request(t.app)
    .post('/api/results')
    .set('Host', 'booth.test')
    .field('consent', '1')
    .attach('photo', THUMB, 'p.jpg');
  assert.equal(noOrigin.status, 403);
  assert.equal(listDir(resultsDir()).length, before);
});

test('POST foto 8 MB + 1 -> 413', async () => {
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 - 2)]);
  assert.equal(big.length, 8 * 1024 * 1024 + 1);
  const before = listDir(resultsDir()).length;
  assert.equal((await post(big)).status, 413);
  assert.equal(listDir(resultsDir()).length, before);
});

test('POST saat disk penuh -> 507 tanpa sisa', async () => {
  const full = await makeTestApp({ resultsStatfs: async () => ({ bsize: 4096, blocks: 262144, bavail: 10 }) });
  try {
    const res = await mutate(request(full.app).post('/api/results'))
      .field('consent', '1')
      .attach('photo', THUMB, 'p.jpg');
    assert.equal(res.status, 507);
    assert.deepEqual(listDir(path.join(full.uploadDir, 'results')), []);
  } finally {
    full.cleanup();
  }
});

test('PUT gif: kunci benar 204 lalu GET memuat gif_url', async () => {
  const { token, key } = await create();
  assert.equal((await putAsset(token, key, 'gif', GIF, 'image/gif')).status, 204);
  const res = await request(t.app).get(`/api/results/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.gif_url, `/r/${token}/anim.gif`);
});

test('PUT: kunci salah 403, tanpa kunci 403, body bukan GIF 422', async () => {
  const { token, key } = await create();
  assert.equal((await putAsset(token, 'salah', 'gif', GIF, 'image/gif')).status, 403);
  assert.equal((await putAsset(token, null, 'gif', GIF, 'image/gif')).status, 403);
  assert.equal((await putAsset(token, key, 'gif', Buffer.from('bukan gif sama sekali'), 'image/gif')).status, 422);
  assert.equal((await putAsset(token, key, 'video', GIF, 'video/webm')).status, 422);
});

test('PUT video webm 204 dan video_type webm', async () => {
  const { token, key } = await create();
  assert.equal((await putAsset(token, key, 'video', WEBM, 'video/webm')).status, 204);
  const res = await request(t.app).get(`/api/results/${token}`);
  assert.equal(res.body.video_type, 'webm');
  assert.equal(res.body.video_url, `/r/${token}/video.webm`);
});

test('GET: token acak valid 404, respons tidak memuat key/key_hash', async () => {
  assert.equal((await request(t.app).get('/api/results/AAAAAAAAAAAAAAAAAAAAAA')).status, 404);
  const { token } = await create();
  const res = await request(t.app).get(`/api/results/${token}`);
  assert.equal(res.status, 200);
  assert.ok(!/key/i.test(JSON.stringify(res.body)));
  assert.equal(new Date(res.body.created_at).toISOString(), res.body.created_at);
  assert.equal(res.body.photo_url, `/r/${token}/photo.jpg`);
});

test('hasil kedaluwarsa -> 410 di GET, PUT, dan file', async () => {
  const { token, key } = await create();
  await putAsset(token, key, 'gif', GIF, 'image/gif');
  clock = new Date(START.getTime() + 7 * 86400_000 + 1000);
  try {
    assert.equal((await request(t.app).get(`/api/results/${token}`)).status, 410);
    assert.equal((await putAsset(token, key, 'gif', GIF, 'image/gif')).status, 410);
    assert.equal((await putAsset(token, key, 'video', WEBM, 'video/webm')).status, 410);
    assert.equal((await request(t.app).get(`/r/${token}/photo.jpg`)).status, 410);
    assert.equal((await request(t.app).get(`/api/results/${token}/qr.svg`)).status, 410);
  } finally {
    clock = START;
  }
});

test('file: photo.jpg header, download, nama tak dikenal 404', async () => {
  const { token } = await create();
  const res = await request(t.app).get(`/r/${token}/photo.jpg`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /image\/jpeg/);
  assert.match(res.headers['cache-control'], /private/);
  assert.equal(res.headers['x-robots-tag'], 'noindex');
  const dl = await request(t.app).get(`/r/${token}/photo.jpg?download=1`);
  assert.match(dl.headers['content-disposition'], /attachment/);
  assert.equal((await request(t.app).get(`/r/${token}/secret.txt`)).status, 404);
  assert.equal((await request(t.app).get(`/r/${token}/..%2Fx`)).status, 404);
  assert.equal((await request(t.app).get(`/r/${token}/../x`)).status, 404);
  assert.equal((await request(t.app).get(`/r/${token}/anim.gif`)).status, 404);
  assert.equal((await request(t.app).get('/r/pendek/photo.jpg')).status, 404);
});

test('video mendukung Range -> 206', async () => {
  const { token, key } = await create();
  await putAsset(token, key, 'video', WEBM, 'video/webm');
  const res = await request(t.app).get(`/r/${token}/video.webm`).set('Range', 'bytes=0-3');
  assert.equal(res.status, 206);
  assert.equal(res.headers['content-range'], `bytes 0-3/${WEBM.length}`);
});

test('qr.svg -> 200 image/svg+xml', async () => {
  const { token } = await create();
  const res = await request(t.app)
    .get(`/api/results/${token}/qr.svg`)
    .buffer(true)
    .parse((r, cb) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => cb(null, d));
    });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /image\/svg\+xml/);
  assert.match(res.body, /<svg/);
});

test('halaman /p/:token: valid 200 HTML, tidak valid 404', async () => {
  const { token } = await create();
  const ok = await request(t.app).get(`/p/${token}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /html/);
  assert.equal(ok.headers['x-robots-tag'], 'noindex');
  assert.equal((await request(t.app).get('/p/abc')).status, 404);
});

test('batas laju: permintaan ke-61 dalam 10 menit -> 429', async () => {
  const lt = await makeTestApp();
  try {
    const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    let last;
    for (let i = 0; i < 61; i++) {
      last = await mutate(request(lt.app).post('/api/results')).field('consent', '1').attach('photo', tiny, 'p.jpg');
      if (i < 60) assert.equal(last.status, 201, `permintaan ${i + 1}`);
    }
    assert.equal(last.status, 429);
  } finally {
    lt.cleanup();
  }
});

test('PUT gif saat disk penuh -> 507 dan tidak ada anim.gif', async () => {
  let bavail = 200000;
  const d = await makeTestApp({ resultsStatfs: async () => ({ bsize: 4096, blocks: 262144, bavail }) });
  try {
    const r = await mutate(request(d.app).post('/api/results')).field('consent', '1').attach('photo', THUMB, 'p.jpg');
    assert.equal(r.status, 201);
    bavail = 10;
    const res = await mutate(request(d.app).put(`/api/results/${r.body.token}/gif`))
      .set('Content-Type', 'image/gif')
      .set('X-Result-Key', r.body.key)
      .send(GIF);
    assert.equal(res.status, 507);
    assert.ok(!listDir(path.join(d.uploadDir, 'results', r.body.token)).includes('anim.gif'));
  } finally {
    d.cleanup();
  }
});

test('PUT gif 10 MB + 1 -> 413, Content-Type salah -> 422', async () => {
  const { token, key } = await create();
  const big = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10 * 1024 * 1024 - 5)]);
  assert.equal((await putAsset(token, key, 'gif', big, 'image/gif')).status, 413);
  assert.equal((await putAsset(token, key, 'gif', GIF, 'text/plain')).status, 422);
});

// --- kirim dan daftar kiriman ---
const sendReq = (app, token, key, body) => {
  let req = mutate(request(app).post(`/api/results/${token}/send`));
  if (key) req = req.set('X-Result-Key', key);
  return req.send(body);
};
const createOn = async (app) => {
  const res = await mutate(request(app).post('/api/results')).field('consent', '1').attach('photo', THUMB, 'p.jpg');
  return res.body;
};

test('send email: 202, deliveries berisi alamat tersamar, kontak dinormalisasi', async () => {
  const s = await makeTestApp({ senders: { email: { send: async () => {} } } });
  try {
    const { token, key } = await createOn(s.app);
    const res = await sendReq(s.app, token, key, { channel: 'email', to: ' Rina@Gmail.com ' });
    assert.equal(res.status, 202);
    assert.ok(Number.isInteger(res.body.id));
    const list = await request(s.app).get(`/api/results/${token}/deliveries`).set('X-Result-Key', key);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, [{ id: res.body.id, channel: 'email', to: 'ri***@gmail.com', status: 'queued' }]);
    assert.equal(s.db.prepare('SELECT recipient FROM deliveries').get().recipient, 'rina@gmail.com');
  } finally {
    s.cleanup();
  }
});

test('send: kunci salah 403, email tidak valid 422, WhatsApp tidak aktif 409, token acak 404', async () => {
  const s = await makeTestApp({ senders: { email: { send: async () => {} } } });
  try {
    const { token, key } = await createOn(s.app);
    assert.equal((await sendReq(s.app, token, 'salah', { channel: 'email', to: 'a@b.com' })).status, 403);
    assert.equal((await sendReq(s.app, token, null, { channel: 'email', to: 'a@b.com' })).status, 403);
    assert.equal((await sendReq(s.app, token, key, { channel: 'email', to: 'bukan-email' })).status, 422);
    assert.equal((await sendReq(s.app, token, key, { channel: 'whatsapp', to: '123' })).status, 422);
    assert.equal((await sendReq(s.app, token, key, { channel: 'sms', to: 'a@b.com' })).status, 422);
    assert.equal((await sendReq(s.app, token, key, { channel: 'whatsapp', to: '0812 3456 7890' })).status, 409);
    assert.equal((await sendReq(s.app, 'A'.repeat(22), key, { channel: 'email', to: 'a@b.com' })).status, 404);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM deliveries').get().n, 0);
    const list = await request(s.app).get(`/api/results/${token}/deliveries`);
    assert.equal(list.status, 403);
  } finally {
    s.cleanup();
  }
});

test('send: kiriman ke-4 -> 429; dua send serentak dengan sisa 1 -> tepat satu 202', async () => {
  const s = await makeTestApp({ senders: { email: { send: async () => {} } } });
  try {
    const { token, key } = await createOn(s.app);
    const body = { channel: 'email', to: 'a@b.com' };
    assert.equal((await sendReq(s.app, token, key, body)).status, 202);
    assert.equal((await sendReq(s.app, token, key, body)).status, 202);
    assert.equal((await sendReq(s.app, token, key, body)).status, 202);
    assert.equal((await sendReq(s.app, token, key, body)).status, 429);

    const second = await createOn(s.app);
    await sendReq(s.app, second.token, second.key, body);
    await sendReq(s.app, second.token, second.key, body);
    const both = await Promise.all([
      sendReq(s.app, second.token, second.key, body),
      sendReq(s.app, second.token, second.key, body),
    ]);
    assert.deepEqual(both.map((r) => r.status).sort(), [202, 429]);
  } finally {
    s.cleanup();
  }
});

test('send: hasil kedaluwarsa -> 410; pengirim yang selalu gagal berakhir failed di daftar', async () => {
  let clk = START;
  const s = await makeTestApp({
    now: () => clk,
    senders: { email: { send: async () => { throw new Error('auth'); } } },
  });
  try {
    const { token, key } = await createOn(s.app);
    await sendReq(s.app, token, key, { channel: 'email', to: 'a@b.com' });
    for (let i = 0; i < 3; i++) {
      await s.app.locals.queue.tick();
      clk = new Date(clk.getTime() + 120_000);
    }
    const list = await request(s.app).get(`/api/results/${token}/deliveries`).set('X-Result-Key', key);
    assert.equal(list.body[0].status, 'failed');
    clk = new Date(START.getTime() + 8 * 864e5);
    assert.equal((await sendReq(s.app, token, key, { channel: 'email', to: 'a@b.com' })).status, 410);
  } finally {
    s.cleanup();
  }
});

// --- PUBLIC_URL, batas harian global, batas unggah ---
const EVIL = (req) => req.set('Host', 'evil.example').set('Origin', 'http://evil.example');
const putGif = (app, token, key, body = GIF) =>
  mutate(request(app).put(`/api/results/${token}/gif`)).set('Content-Type', 'image/gif').set('X-Result-Key', key).send(body);

test('PUBLIC_URL dipakai untuk base_url, url respons, dan tautan email walau Host palsu', async () => {
  const calls = [];
  const s = await makeTestApp({
    env: { PUBLIC_URL: 'https://photobooth-anugrah.fly.dev/' },
    senders: { email: { send: async (args) => { calls.push(args); } } },
  });
  try {
    const res = await EVIL(request(s.app).post('/api/results')).field('consent', '1').attach('photo', THUMB, 'p.jpg');
    assert.equal(res.status, 201);
    const pub = 'https://photobooth-anugrah.fly.dev';
    assert.equal(res.body.url, `${pub}/p/${res.body.token}`);
    assert.equal(s.db.prepare('SELECT base_url FROM results').get().base_url, pub);
    const sent = await EVIL(request(s.app).post(`/api/results/${res.body.token}/send`))
      .set('X-Result-Key', res.body.key)
      .send({ channel: 'email', to: 'a@b.com' });
    assert.equal(sent.status, 202);
    await s.app.locals.queue.tick();
    assert.equal(calls[0].pageUrl, `${pub}/p/${res.body.token}`);
  } finally {
    s.cleanup();
  }
});

test('batas kiriman harian global: melewati MAX_DELIVERIES_PER_DAY -> 429, pulih setelah 24 jam', async () => {
  let clk = START;
  const s = await makeTestApp({ now: () => clk, env: { MAX_DELIVERIES_PER_DAY: '2' }, senders: { email: { send: async () => {} } } });
  try {
    const a = await createOn(s.app);
    const b = await createOn(s.app);
    const body = { channel: 'email', to: 'a@b.com' };
    assert.equal((await sendReq(s.app, a.token, a.key, body)).status, 202);
    assert.equal((await sendReq(s.app, b.token, b.key, body)).status, 202);
    const over = await sendReq(s.app, b.token, b.key, body);
    assert.equal(over.status, 429);
    assert.equal(over.body.error, 'Batas kiriman harian tercapai. Coba lagi besok.');
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM deliveries').get().n, 2);
    clk = new Date(START.getTime() + 24 * 3600_000 + 1);
    assert.equal((await sendReq(s.app, b.token, b.key, body)).status, 202);
  } finally {
    s.cleanup();
  }
});

test('batas laju PUT aset: permintaan ke-31 dalam 10 menit -> 429', async () => {
  const s = await makeTestApp();
  try {
    const { token, key } = await createOn(s.app);
    for (let i = 0; i < 30; i++) assert.equal((await putGif(s.app, token, key)).status, 204, `permintaan ${i + 1}`);
    const last = await mutate(request(s.app).put(`/api/results/${token}/video`))
      .set('Content-Type', 'video/webm')
      .set('X-Result-Key', key)
      .send(WEBM);
    assert.equal(last.status, 429);
  } finally {
    s.cleanup();
  }
});

test('batas unggahan serentak: 3 unggahan tertahan -> ke-4 503 + Retry-After, slot lepas saat koneksi putus', async () => {
  const http = await import('node:http');
  const s = await makeTestApp();
  const server = s.app.listen(0);
  const gate = s.app.locals.uploadGate;
  const waitFor = async (cond) => {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(cond());
  };
  const held = [];
  try {
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address();
    const { token, key } = await createOn(s.app);
    for (let i = 0; i < 3; i++) {
      const req = http.request({
        port,
        method: 'PUT',
        path: `/api/results/${token}/gif`,
        headers: { Host: 'booth.test', Origin: 'http://booth.test', 'Content-Type': 'image/gif', 'X-Result-Key': key, 'Content-Length': 1000 },
      });
      req.on('error', () => {});
      req.write('GIF89a');
      held.push(req);
    }
    await waitFor(() => gate.active === 3);
    const busy = await putGif(s.app, token, key);
    assert.equal(busy.status, 503);
    assert.equal(busy.headers['retry-after'], '5');
    assert.ok(busy.body.error);
    const busyPhoto = await mutate(request(s.app).post('/api/results')).field('consent', '1').attach('photo', THUMB, 'p.jpg');
    assert.equal(busyPhoto.status, 503);
    held.forEach((r) => r.destroy());
    await waitFor(() => gate.active === 0);
    assert.equal((await putGif(s.app, token, key)).status, 204);
  } finally {
    held.forEach((r) => r.destroy());
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    s.cleanup();
  }
});

test('slot unggahan dilepas setelah galat (413, 422, foto PNG)', async () => {
  const s = await makeTestApp();
  try {
    const gate = s.app.locals.uploadGate;
    const { token, key } = await createOn(s.app);
    const big = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10 * 1024 * 1024 - 5)]);
    assert.equal((await putGif(s.app, token, key, big)).status, 413);
    assert.equal((await putGif(s.app, token, key, PNG)).status, 422);
    assert.equal((await mutate(request(s.app).post('/api/results')).field('consent', '1').attach('photo', PNG, 'p.jpg')).status, 422);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(gate.active, 0);
  } finally {
    s.cleanup();
  }
});
