import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWakeLock } from '../public/js/wake-lock.js';

const sentinel = () => ({
  released: false,
  release() {
    this.released = true;
    return Promise.resolve();
  },
});

test('release sebelum request selesai: sentinel yang datang belakangan langsung dilepas', async () => {
  let resolve;
  const lock = createWakeLock(() => new Promise((r) => (resolve = r)));
  const pending = lock.acquire();
  lock.release();
  const s = sentinel();
  resolve(s);
  await pending;
  assert.equal(s.released, true);
  assert.equal(lock.held(), false);
});

test('acquire lalu release biasa', async () => {
  const s = sentinel();
  const lock = createWakeLock(async () => s);
  await lock.acquire();
  assert.equal(lock.held(), true);
  lock.release();
  assert.equal(s.released, true);
  assert.equal(lock.held(), false);
});

test('request melempar: acquire tidak melempar', async () => {
  const lock = createWakeLock(() => Promise.reject(new Error('ditolak')));
  await lock.acquire();
  assert.equal(lock.held(), false);
  const sync = createWakeLock(() => {
    throw new Error('tidak didukung');
  });
  await sync.acquire();
  assert.equal(sync.held(), false);
});

test('request mengembalikan undefined (API tidak ada): tidak melempar', async () => {
  const lock = createWakeLock(() => undefined);
  await lock.acquire();
  assert.equal(lock.held(), false);
});

test('acquire dua kali berturut-turut: request sekali', async () => {
  let calls = 0;
  const lock = createWakeLock(async () => (calls++, sentinel()));
  await Promise.all([lock.acquire(), lock.acquire()]);
  await lock.acquire();
  assert.equal(calls, 1);
});

test('bisa acquire lagi setelah release', async () => {
  let calls = 0;
  const lock = createWakeLock(async () => (calls++, sentinel()));
  await lock.acquire();
  lock.release();
  await lock.acquire();
  assert.equal(calls, 2);
  assert.equal(lock.held(), true);
});
