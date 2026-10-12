import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, applyMatrix, filterById } from '../public/js/filters.js';

const px = (...rgba) => new Uint8ClampedArray(rgba);

test('urutan FILTERS lengkap; normal.matrix null', () => {
  assert.deepEqual(
    FILTERS.map((f) => f.id),
    ['normal', 'bw', 'sepia', 'warm', 'cool', 'contrast'],
  );
  assert.equal(filterById('normal').matrix, null);
});

test('id unik dan label berbahasa Indonesia', () => {
  assert.equal(new Set(FILTERS.map((f) => f.id)).size, FILTERS.length);
  assert.equal(filterById('bw').label, 'Hitam putih');
  assert.equal(filterById('sepia').label, 'Sepia');
  assert.equal(filterById('normal').label, 'Normal');
});

test('filterById tidak dikenal → normal', () => {
  assert.equal(filterById('tidak-ada').id, 'normal');
});

test('bw: piksel (255,0,0,200) → r=g=b=76, alpha 200', () => {
  const d = px(255, 0, 0, 200);
  applyMatrix(d, filterById('bw').matrix);
  assert.deepEqual([...d], [76, 76, 76, 200]);
});

test('sepia: putih → (255,255,239) karena clamp', () => {
  const d = px(255, 255, 255, 255);
  applyMatrix(d, filterById('sepia').matrix);
  assert.deepEqual([...d], [255, 255, 239, 255]);
});

test('applyMatrix memproses semua piksel', () => {
  const d = px(255, 0, 0, 255, 0, 0, 255, 10);
  applyMatrix(d, filterById('bw').matrix);
  assert.deepEqual([...d], [76, 76, 76, 255, 29, 29, 29, 10]);
});

test('label filter tambahan', () => {
  assert.equal(filterById('warm').label, 'Hangat');
  assert.equal(filterById('cool').label, 'Dingin');
  assert.equal(filterById('contrast').label, 'Kontras');
});

test('kontras: abu 128 tetap 128, 200 → 222', () => {
  const d = px(128, 128, 128, 255, 200, 200, 200, 255);
  applyMatrix(d, filterById('contrast').matrix);
  assert.deepEqual([...d], [128, 128, 128, 255, 222, 222, 222, 255]);
});

test('hangat menaikkan merah dan menurunkan biru; dingin sebaliknya', () => {
  const warm = px(100, 100, 100, 255);
  applyMatrix(warm, filterById('warm').matrix);
  assert.ok(warm[0] > 100 && warm[2] < 100);
  const cool = px(100, 100, 100, 255);
  applyMatrix(cool, filterById('cool').matrix);
  assert.ok(cool[0] < 100 && cool[2] > 100);
});
