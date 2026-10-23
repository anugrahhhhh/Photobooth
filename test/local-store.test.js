import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, read, write } from '../public/js/storage.js';

const throwing = {
  getItem() { throw new Error('diblokir'); },
  setItem() { throw new Error('diblokir'); },
  removeItem() { throw new Error('diblokir'); },
};

function mapStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

test('KEYS memuat semua kunci pb.*', () => {
  assert.deepEqual(KEYS, {
    theme: 'pb.theme', lang: 'pb.lang', kiosk: 'pb.kiosk',
    sound: 'pb.sound', kioskLang: 'pb.kioskLang', cameraId: 'pb.cameraId', mirror: 'pb.mirror',
  });
});

test('storage yang melempar tidak membuat read/write melempar', () => {
  assert.equal(read(KEYS.theme, throwing), null);
  assert.doesNotThrow(() => write(KEYS.theme, 'dark', throwing));
  assert.doesNotThrow(() => write(KEYS.theme, null, throwing));
});

test('write lalu read mengembalikan nilai yang sama; null menghapus', () => {
  const s = mapStore();
  write(KEYS.theme, 'dark', s);
  assert.equal(read(KEYS.theme, s), 'dark');
  write(KEYS.theme, null, s);
  assert.equal(read(KEYS.theme, s), null);
});

test('tanpa localStorage (Node) read mengembalikan null', () => {
  assert.equal(read(KEYS.theme, undefined), null);
  assert.doesNotThrow(() => write(KEYS.theme, 'x', undefined));
});
