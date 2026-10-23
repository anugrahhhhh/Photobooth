import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareSession } from '../public/js/booth/share.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setup() {
  const creates = [];
  const puts = [];
  const calls = [];
  const api = {
    createResult: (form) => {
      const d = deferred();
      creates.push({ form, ...d });
      return d.promise;
    },
    putAsset: async (token, key, kind, blob) => {
      puts.push({ token, key, kind, blob });
    },
    postSend: async (token, key, body) => {
      calls.push(['postSend', token, key, body]);
      return { id: 7 };
    },
    getDeliveries: async (token, key) => {
      calls.push(['getDeliveries', token, key]);
      return [{ id: 7, channel: 'email', to: 'ri***@x.com', status: 'sent' }];
    },
  };
  const share = createShareSession({ api, now: () => 0 });
  const reply = (i, token) =>
    creates[i].resolve({ token, key: `k-${token}`, url: `https://x/p/${token}`, expires_at: '2030-01-01T00:00:00Z' });
  return { share, creates, puts, reply, calls };
}
const meta = { templateId: 1, lang: 'id' };

test('file yang sama hanya diunggah sekali', async () => {
  const { share, creates, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const p1 = share.ensureResult(file, meta);
  const p2 = share.ensureResult(file, meta);
  reply(0, 'AAA');
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(creates.length, 1);
  assert.equal(r1.token, 'AAA');
  assert.equal(r2.token, 'AAA');
  assert.equal(r1.expiresAt, '2030-01-01T00:00:00Z');
  assert.equal((await share.ensureResult(file, meta)).token, 'AAA');
  assert.equal(creates.length, 1);
  assert.deepEqual(share.current(), { token: 'AAA', key: 'k-AAA', url: 'https://x/p/AAA' });
});

test('file baru membuat hasil baru', async () => {
  const { share, creates, reply } = setup();
  const p1 = share.ensureResult(new File(['a'], 'a.jpg'), meta);
  reply(0, 'AAA');
  await p1;
  const p2 = share.ensureResult(new File(['b'], 'b.jpg'), meta);
  reply(1, 'BBB');
  assert.equal((await p2).token, 'BBB');
  assert.equal(creates.length, 2);
  assert.equal(share.current().token, 'BBB');
});

test('reset saat unggah: hasil dibuang dan current() null', async () => {
  const { share, reply } = setup();
  const p = share.ensureResult(new File(['a'], 'a.jpg'), meta);
  share.reset();
  reply(0, 'AAA');
  await p;
  assert.equal(share.current(), null);
});

test('kegagalan tidak di-cache: coba lagi mengunggah ulang', async () => {
  const { share, creates, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const p1 = share.ensureResult(file, meta);
  creates[0].reject(new Error('boom'));
  await assert.rejects(p1);
  const p2 = share.ensureResult(file, meta);
  reply(1, 'AAA');
  assert.equal((await p2).token, 'AAA');
  assert.equal(creates.length, 2);
});

test('uploadAsset menunggu ensureResult selesai', async () => {
  const { share, puts, reply } = setup();
  const p = share.ensureResult(new File(['a'], 'a.jpg'), meta);
  const blob = { size: 1 };
  const up = share.uploadAsset('gif', blob);
  await Promise.resolve();
  assert.equal(puts.length, 0);
  reply(0, 'AAA');
  await p;
  await up;
  assert.deepEqual(puts, [{ token: 'AAA', key: 'k-AAA', kind: 'gif', blob }]);
});

test('uploadAsset tanpa hasil ditolak', async () => {
  const { share } = setup();
  await assert.rejects(share.uploadAsset('gif', {}));
});

test('send sebelum ada hasil: createResult lalu postSend berurutan', async () => {
  const { share, creates, reply, calls } = setup();
  const file = new File(['a'], 'a.jpg');
  const p = share.send('email', 'a@x.com', { file, ...meta });
  await Promise.resolve();
  assert.equal(creates.length, 1);
  assert.equal(calls.length, 0);
  reply(0, 'AAA');
  assert.deepEqual(await p, { id: 7 });
  assert.deepEqual(calls, [['postSend', 'AAA', 'k-AAA', { channel: 'email', to: 'a@x.com' }]]);
});

test('send memakai hasil yang sudah ada tanpa unggah ulang', async () => {
  const { share, creates, reply, calls } = setup();
  const file = new File(['a'], 'a.jpg');
  const p = share.ensureResult(file, meta);
  reply(0, 'AAA');
  await p;
  await share.send('whatsapp', '62812', { file, ...meta });
  assert.equal(creates.length, 1);
  assert.equal(calls[0][3].channel, 'whatsapp');
});

test('reset di antara unggah dan kirim: postSend tidak dipanggil', async () => {
  const { share, reply, calls } = setup();
  const p = share.send('email', 'a@x.com', { file: new File(['a'], 'a.jpg'), ...meta });
  share.reset();
  reply(0, 'AAA');
  await assert.rejects(p);
  assert.equal(calls.length, 0);
});

test('deliveries kosong tanpa hasil, dan dibuang bila reset saat menunggu', async () => {
  const { share, reply, calls } = setup();
  assert.deepEqual(await share.deliveries(), []);
  const p = share.ensureResult(new File(['a'], 'a.jpg'), meta);
  reply(0, 'AAA');
  await p;
  assert.equal((await share.deliveries())[0].status, 'sent');
  assert.deepEqual(calls.at(-1), ['getDeliveries', 'AAA', 'k-AAA']);
  const pending = share.deliveries();
  share.reset();
  assert.deepEqual(await pending, []);
});

test('kirim otomatis hanya untuk File pertama sesi, dan dibuka lagi oleh reset', () => {
  const { share } = setup();
  const a = new File(['a'], 'a.jpg');
  const b = new File(['b'], 'b.jpg');
  assert.equal(share.claimAutoSend(a), true);
  assert.equal(share.claimAutoSend(a), false);
  assert.equal(share.claimAutoSend(b), false);
  share.reset();
  assert.equal(share.claimAutoSend(b), true);
});

test('epoch naik hanya saat reset, tidak oleh hasil baru', async () => {
  const { share, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const e0 = share.epoch();
  const p = share.ensureResult(file, meta);
  reply(0, 'AAA');
  await p;
  assert.equal(share.epoch(), e0);
  share.reset();
  assert.equal(share.epoch(), e0 + 1);
});

test('attachGif: GIF diunggah setelah hasil dibuat untuk File yang sama', async () => {
  const { share, puts, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const blob = { size: 1 };
  share.attachGif(file, blob); // GIF selesai lebih dulu daripada hasil server
  assert.equal(puts.length, 0);
  const p = share.ensureResult(file, meta);
  reply(0, 'AAA');
  await p;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(puts, [{ token: 'AAA', key: 'k-AAA', kind: 'gif', blob }]);
});

test('attachGif: langsung diunggah bila hasil sudah ada, dan tidak ganda', async () => {
  const { share, puts, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const p = share.ensureResult(file, meta);
  reply(0, 'AAA');
  await p;
  const blob = { size: 1 };
  share.attachGif(file, blob);
  share.attachGif(file, blob);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(puts.length, 1);
});

test('attachGif: GIF untuk File lain atau setelah reset tidak diunggah', async () => {
  const { share, puts, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const p = share.ensureResult(file, meta);
  share.attachGif(new File(['b'], 'b.jpg'), { size: 1 });
  reply(0, 'AAA');
  await p;
  share.reset();
  share.attachGif(file, { size: 3 });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(puts.length, 0);
});

test('attachVideo: diunggah setelah hasil dibuat untuk File yang sama, tidak ganda', async () => {
  const { share, puts, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const blob = { size: 1 };
  share.attachVideo(file, blob, 'webm');
  const p = share.ensureResult(file, meta);
  reply(0, 'AAA');
  await p;
  share.attachVideo(file, blob, 'webm');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(puts, [{ token: 'AAA', key: 'k-AAA', kind: 'video', blob }]);
});

test('attachVideo: File lain atau setelah reset tidak diunggah', async () => {
  const { share, puts, reply } = setup();
  const file = new File(['a'], 'a.jpg');
  const p = share.ensureResult(file, meta);
  share.attachVideo(new File(['b'], 'b.jpg'), { size: 1 }, 'mp4');
  reply(0, 'AAA');
  await p;
  share.reset();
  share.attachVideo(file, { size: 3 }, 'mp4');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(puts.length, 0);
});

test('attachVideo: 413 dilaporkan lewat onError, error lain diam-diam dan boleh diulang', async () => {
  const puts = [];
  let failWith = { status: 413 };
  const api = {
    createResult: async () => ({ token: 'T', key: 'k', url: 'u', expires_at: 'x' }),
    putAsset: async (...args) => {
      puts.push(args);
      if (failWith) throw failWith;
    },
  };
  const share = createShareSession({ api });
  const file = new File(['a'], 'a.jpg');
  await share.ensureResult(file, meta);
  const errors = [];
  share.attachVideo(file, { size: 1 }, 'webm', (e) => errors.push(e.status));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(errors, [413]);
  failWith = { status: 500 };
  const blob2 = { size: 2 };
  share.attachVideo(file, blob2, 'webm', (e) => errors.push(e.status));
  await new Promise((r) => setTimeout(r, 0));
  failWith = null;
  share.attachVideo(file, { size: 3 }, 'webm');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(errors, [413]);
  assert.equal(puts.length, 3);
});
