import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSlots } from '../public/js/detect-slots.js';

// Kanvas opak (alpha 255) dengan lubang transparan di setiap kotak.
function alphaWith(w, h, holes, holeAlpha = 0) {
  const a = new Uint8Array(w * h).fill(255);
  for (const r of holes) {
    for (let y = r.y; y < r.y + r.h; y++) a.fill(holeAlpha, y * w + r.x, y * w + r.x + r.w);
  }
  return a;
}

test('tiga lubang vertikal → tiga kotak tepat, urut atas ke bawah', () => {
  const holes = [
    { x: 10, y: 130, w: 80, h: 50 },
    { x: 10, y: 10, w: 80, h: 50 },
    { x: 10, y: 70, w: 80, h: 50 },
  ];
  assert.deepEqual(detectSlots(alphaWith(100, 200, holes), 100, 200), [holes[1], holes[2], holes[0]]);
});

test('grid 2x2 dengan y sedikit berbeda → urut kiri-kanan per baris', () => {
  const tl = { x: 10, y: 15, w: 80, h: 80 };
  const tr = { x: 110, y: 10, w: 80, h: 80 };
  const bl = { x: 110 - 100, y: 115, w: 80, h: 80 };
  const br = { x: 110, y: 110, w: 80, h: 80 };
  assert.deepEqual(detectSlots(alphaWith(200, 200, [br, tr, bl, tl]), 200, 200), [tl, tr, bl, br]);
});

test('lubang kecil < 0,5% luas diabaikan', () => {
  const big = { x: 0, y: 0, w: 50, h: 50 };
  const tiny = { x: 80, y: 80, w: 6, h: 6 }; // 36 px < 0,5% × 10000 = 50
  assert.deepEqual(detectSlots(alphaWith(100, 100, [big, tiny]), 100, 100), [big]);
});

test('tanpa lubang → []', () => {
  assert.deepEqual(detectSlots(alphaWith(50, 50, []), 50, 50), []);
});

test('alpha 127 dihitung lubang, 128 tidak (ambang default)', () => {
  const hole = { x: 0, y: 0, w: 20, h: 20 };
  assert.deepEqual(detectSlots(alphaWith(40, 40, [hole], 127), 40, 40), [hole]);
  assert.deepEqual(detectSlots(alphaWith(40, 40, [hole], 128), 40, 40), []);
});

test('bentuk tak beraturan → kotak pembatasnya', () => {
  const a = alphaWith(60, 60, [
    { x: 10, y: 10, w: 30, h: 10 },
    { x: 10, y: 20, w: 10, h: 25 },
  ]);
  assert.deepEqual(detectSlots(a, 60, 60), [{ x: 10, y: 10, w: 30, h: 35 }]);
});

test('piksel diagonal tidak tersambung (4-tetangga)', () => {
  const a = alphaWith(100, 100, [
    { x: 0, y: 0, w: 30, h: 30 },
    { x: 30, y: 30, w: 30, h: 30 },
  ]);
  assert.equal(detectSlots(a, 100, 100).length, 2);
});

test('kanvas 4000x3000 penuh lubang selesai tanpa stack overflow', () => {
  const a = new Uint8Array(4000 * 3000);
  assert.deepEqual(detectSlots(a, 4000, 3000), [{ x: 0, y: 0, w: 4000, h: 3000 }]);
});

test('menerima Uint8ClampedArray', () => {
  const a = new Uint8ClampedArray(alphaWith(20, 20, [{ x: 0, y: 0, w: 20, h: 20 }]));
  assert.equal(detectSlots(a, 20, 20).length, 1);
});
