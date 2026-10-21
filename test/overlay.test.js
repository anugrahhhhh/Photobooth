import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayLayout } from '../public/js/booth/overlay.js';
import { TEST_TEMPLATE } from './helpers.js';

const near = (actual, expected) => {
  for (const [k, v] of Object.entries(expected)) {
    assert.ok(Number.isFinite(actual[k]), `${k} finite`);
    assert.ok(Math.abs(actual[k] - v) < 1e-6, `${k}: ${actual[k]} != ${v}`);
  }
};
const sq = (slot) => ({ canvas_w: 1000, canvas_h: 1000, slots: [slot] });

test('slot di tengah kanvas', () => {
  const l = overlayLayout(sq({ x: 400, y: 400, w: 200, h: 100 }), 0);
  near(l.region, { x: 364, y: 364, w: 272, h: 172 });
  near(l.slot, { left: 13.235294, top: 20.930233, width: 73.529412, height: 58.139535 });
  near(l.image, { left: -133.823529, top: -211.627907, width: 367.647059, height: 581.395349 });
});

test('terpotong di tepi kanvas', () => {
  const l = overlayLayout(TEST_TEMPLATE, 0);
  near(l.region, { x: 0, y: 0, w: 300, h: 241 });
  near(l.slot, { left: 3.333333, top: 4.149378 });
});

test('slot di pojok kanan bawah', () => {
  const l = overlayLayout(sq({ x: 800, y: 900, w: 200, h: 100 }), 0);
  near(l.region, { x: 764, y: 864, w: 236, h: 136 });
  near(l.slot, { left: 15.254237, top: 26.470588 });
});

test('slot seluas kanvas', () => {
  const l = overlayLayout({ canvas_w: 300, canvas_h: 400, slots: [{ x: 0, y: 0, w: 300, h: 400 }] }, 0);
  near(l.region, { x: 0, y: 0, w: 300, h: 400 });
  near(l.slot, { left: 0, top: 0, width: 100, height: 100 });
  near(l.image, { left: 0, top: 0, width: 100, height: 100 });
});

test('margin 0: region sama dengan slot', () => {
  const l = overlayLayout(sq({ x: 400, y: 400, w: 200, h: 100 }), 0, { margin: 0 });
  near(l.region, { x: 400, y: 400, w: 200, h: 100 });
  near(l.slot, { left: 0, top: 0, width: 100, height: 100 });
});
