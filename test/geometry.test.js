import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverScale,
  clampTransform,
  photoRect,
  fitWithin,
  previewScale,
  clientToTemplate,
  hitSlot,
  DEFAULT_TRANSFORM,
} from '../public/js/geometry.js';

const SLOT = { x: 100, y: 50, w: 1100, h: 1700 };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

function covers(rect, slot) {
  return (
    rect.x <= slot.x + 1e-9 &&
    rect.y <= slot.y + 1e-9 &&
    rect.x + rect.w >= slot.x + slot.w - 1e-9 &&
    rect.y + rect.h >= slot.y + slot.h - 1e-9
  );
}

test('coverScale: foto 1920x1080 ke slot 1100x1700 → 1700/1080', () => {
  close(coverScale(1920, 1080, 1100, 1700), 1700 / 1080);
  close(coverScale(1080, 1920, 1000, 480), 1000 / 1080);
});

test('DEFAULT_TRANSFORM tengah, zoom 1', () => {
  assert.deepEqual(DEFAULT_TRANSFORM, { panX: 0, panY: 0, zoom: 1 });
});

test('photoRect transform default menutupi slot dan berpusat di slot', () => {
  const r = photoRect(1920, 1080, SLOT, DEFAULT_TRANSFORM);
  assert.ok(covers(r, SLOT));
  close(r.x + r.w / 2, SLOT.x + SLOT.w / 2);
  close(r.y + r.h / 2, SLOT.y + SLOT.h / 2);
  close(r.h, SLOT.h);
});

test('clampTransform: zoom 5 → 3, zoom 0.5 → 1', () => {
  assert.equal(clampTransform({ panX: 0, panY: 0, zoom: 5 }, 1920, 1080, SLOT).zoom, 3);
  assert.equal(clampTransform({ panX: 0, panY: 0, zoom: 0.5 }, 1920, 1080, SLOT).zoom, 1);
});

test('clampTransform: pan berlebih dibatasi sehingga foto tetap menutupi slot', () => {
  for (const t of [
    { panX: 10, panY: 0, zoom: 1 },
    { panX: -10, panY: 10, zoom: 1.5 },
    { panX: 0, panY: -10, zoom: 3 },
  ]) {
    const c = clampTransform(t, 1920, 1080, SLOT);
    assert.ok(covers(photoRect(1920, 1080, SLOT, c), SLOT), JSON.stringify(t));
  }
  // Foto lanskap ke slot potret pada zoom 1: tinggi pas, tidak bisa digeser vertikal.
  close(clampTransform({ panX: 0, panY: 0.3, zoom: 1 }, 1920, 1080, SLOT).panY, 0);
});

test('clampTransform: pan maksimal persis di tepi', () => {
  const c = clampTransform({ panX: 99, panY: 0, zoom: 1 }, 1920, 1080, SLOT);
  const r = photoRect(1920, 1080, SLOT, c);
  close(r.x, SLOT.x, 'tepi kiri foto = tepi kiri slot');
});

test('clampTransform: zoom turun setelah pan maksimal → pan ikut dibatasi ulang', () => {
  const zoomed = clampTransform({ panX: 99, panY: 99, zoom: 3 }, 1920, 1080, SLOT);
  const back = clampTransform({ ...zoomed, zoom: 1 }, 1920, 1080, SLOT);
  assert.ok(Math.abs(back.panX) < Math.abs(zoomed.panX));
  assert.ok(covers(photoRect(1920, 1080, SLOT, back), SLOT));
});

test('clampTransform tidak mengubah objek masukan', () => {
  const t = { panX: 9, panY: 9, zoom: 9 };
  clampTransform(t, 1920, 1080, SLOT);
  assert.deepEqual(t, { panX: 9, panY: 9, zoom: 9 });
});

test('hasil sama untuk foto 1920 dan salinan 1024 pada transform yang sama', () => {
  const t = clampTransform({ panX: 0.1, panY: 0, zoom: 1.7 }, 1920, 1080, SLOT);
  const full = photoRect(1920, 1080, SLOT, t);
  const small = photoRect(1024, 576, SLOT, t);
  for (const k of ['x', 'y', 'w', 'h']) close(full[k], small[k], k);
});

test('fitWithin tidak pernah memperbesar', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1920), { w: 1920, h: 1440 });
  assert.deepEqual(fitWithin(3000, 4000, 1920), { w: 1440, h: 1920 });
  assert.deepEqual(fitWithin(800, 600, 1920), { w: 800, h: 600 });
});

test('previewScale memakai dpr, dibatasi 2', () => {
  close(previewScale(1200, 1800, 400, 900, 1), 1 / 3);
  close(previewScale(1200, 1800, 400, 900, 3), 2 / 3);
});

test('clientToTemplate memperhitungkan ukuran CSS ≠ ukuran kanvas dan scale', () => {
  // Kanvas 800 px piksel ditampilkan 400 px CSS, scale 0.5 (template 1600 lebar).
  const rect = { left: 10, top: 20, width: 400, height: 600 };
  const p = clientToTemplate(210, 320, rect, 800, 1200, 0.5);
  close(p.x, 800);
  close(p.y, 1200);
});

test('hitSlot di dalam, di tepi, dan di luar', () => {
  const slots = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 20, y: 0, w: 10, h: 10 },
  ];
  assert.equal(hitSlot(slots, { x: 5, y: 5 }), 0);
  assert.equal(hitSlot(slots, { x: 20, y: 0 }), 1);
  assert.equal(hitSlot(slots, { x: 15, y: 5 }), -1);
  assert.equal(hitSlot(slots, { x: 10, y: 5 }), -1);
});
