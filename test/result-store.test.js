import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResultStore } from '../public/js/booth/result-store.js';

function setup() {
  const created = [];
  const revoked = [];
  const store = createResultStore({
    createURL: () => {
      const u = `blob:${created.length + 1}`;
      created.push(u);
      return u;
    },
    revokeURL: (u) => revoked.push(u),
  });
  return { store, created, revoked };
}
const file = { name: 'strip.png' };

test('commit dengan job lama setelah invalidate ditolak tanpa membuat URL', () => {
  const { store, created } = setup();
  const a = store.begin();
  store.invalidate();
  assert.equal(store.commit(a, file), false);
  assert.equal(created.length, 0);
  assert.equal(store.current(), null);
});

test('commit job terbaru diterima dan invalidate melepas URL', () => {
  const { store, revoked } = setup();
  const b = store.begin();
  assert.equal(store.commit(b, file), true);
  assert.equal(store.current().url, 'blob:1');
  assert.equal(store.current().file, file);
  store.invalidate();
  assert.deepEqual(revoked, ['blob:1']);
  assert.equal(store.current(), null);
});

test('dua job berurutan: hanya commit job kedua yang diterima', () => {
  const { store, created } = setup();
  const first = store.begin();
  const second = store.begin();
  assert.equal(store.commit(first, file), false);
  assert.equal(store.commit(second, file), true);
  assert.equal(created.length, 1);
});

test('commit ulang melepas URL sebelumnya', () => {
  const { store, revoked } = setup();
  const a = store.begin();
  store.commit(a, file);
  const b = store.begin();
  assert.equal(store.commit(b, file), true);
  assert.deepEqual(revoked, ['blob:1']);
  assert.equal(store.current().url, 'blob:2');
});

test('invalidate tanpa hasil tidak melepas apa pun', () => {
  const { store, revoked } = setup();
  store.invalidate();
  assert.deepEqual(revoked, []);
});
