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
  const api = {
    createResult: (form) => {
      const d = deferred();
      creates.push({ form, ...d });
      return d.promise;
    },
    putAsset: async (token, key, kind, blob) => {
      puts.push({ token, key, kind, blob });
    },
  };
  const share = createShareSession({ api, now: () => 0 });
  const reply = (i, token) =>
    creates[i].resolve({ token, key: `k-${token}`, url: `https://x/p/${token}`, expires_at: '2030-01-01T00:00:00Z' });
  return { share, creates, puts, reply };
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
