import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGifFrames } from '../public/js/media/gif.js';
import { photoRect, clampTransform, DEFAULT_TRANSFORM } from '../public/js/geometry.js';
import { TEST_TEMPLATE } from './helpers.js';

const photo = (w, h) => ({ width: w, height: h });

test('slot landscape: sisi terpanjang 640, rect foto = photoRect x k', () => {
  const photos = [photo(192, 108), photo(192, 108)];
  const plan = planGifFrames(TEST_TEMPLATE, photos, [DEFAULT_TRANSFORM, DEFAULT_TRANSFORM]);
  assert.equal(plan.length, 2);
  const slot = TEST_TEMPLATE.slots[0];
  const k = 640 / 280;
  const r = photoRect(192, 108, slot, clampTransform(DEFAULT_TRANSFORM, 192, 108, slot));
  assert.equal(plan[0].slot, 0);
  assert.equal(plan[0].w, 640);
  assert.equal(plan[0].h, 411);
  assert.ok(Math.abs(plan[0].dw - r.w * k) < 1e-9);
  assert.ok(Math.abs(plan[0].dh - r.h * k) < 1e-9);
  assert.ok(Math.abs(plan[0].dx - (r.x - slot.x) * k) < 1e-9);
  assert.ok(Math.abs(plan[0].dy - (r.y - slot.y) * k) < 1e-9);
});

test('slot tanpa foto dilewati', () => {
  const plan = planGifFrames(TEST_TEMPLATE, [null, photo(192, 108)], [DEFAULT_TRANSFORM, DEFAULT_TRANSFORM]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].slot, 1);
});

test('slot potret: tinggi 640', () => {
  const tpl = { ...TEST_TEMPLATE, slots: [{ x: 0, y: 0, w: 180, h: 280 }] };
  const [f] = planGifFrames(tpl, [photo(100, 100)], [DEFAULT_TRANSFORM]);
  assert.equal(f.h, 640);
  assert.equal(f.w, Math.round((180 * 640) / 280));
});

test('transform di-clamp dan maxSide dapat diatur', () => {
  const slot = TEST_TEMPLATE.slots[0];
  const wild = { panX: 9, panY: 9, zoom: 1 };
  const [f] = planGifFrames(TEST_TEMPLATE, [photo(192, 108)], [wild], 100);
  const r = photoRect(192, 108, slot, clampTransform(wild, 192, 108, slot));
  assert.equal(f.w, 100);
  assert.ok(Math.abs(f.dx - (r.x - slot.x) * (100 / 280)) < 1e-9);
});
