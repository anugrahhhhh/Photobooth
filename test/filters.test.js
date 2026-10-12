import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, applyMatrix, filterById } from '../public/js/filters.js';

const px = (...rgba) => new Uint8ClampedArray(rgba);

test('urutan FILTERS: normal, bw, sepia; normal.matrix null', () => {
  assert.deepEqual(
    FILTERS.map((f) => f.id),
    ['normal', 'bw', 'sepia'],
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
