import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCanvas, validateSlots, MAX_SIDE, MAX_PIXELS, MAX_SLOTS } from '../public/js/slots.js';

const slot = (x, y, w = 10, h = 10) => ({ x, y, w, h });

test('konstanta sesuai spec', () => {
  assert.equal(MAX_SIDE, 4000);
  assert.equal(MAX_PIXELS, 12_000_000);
  assert.equal(MAX_SLOTS, 8);
});

test('kanvas 4000x3000 valid; 4001x10, 0x10, 4000x3001 error', () => {
  assert.deepEqual(validateCanvas(4000, 3000), []);
  assert.ok(validateCanvas(4001, 10).length > 0);
  assert.ok(validateCanvas(0, 10).length > 0);
  assert.ok(validateCanvas(4000, 3001).length > 0);
});

test('kanvas bukan bilangan bulat error', () => {
  assert.ok(validateCanvas(10.5, 10).length > 0);
  assert.ok(validateCanvas('100', 10).length > 0);
});

test('0 slot error; 9 slot error; 8 slot valid', () => {
  assert.ok(validateSlots([], 100, 100).errors.length > 0);
  const nine = Array.from({ length: 9 }, (_, i) => slot(i * 10, 0, 10, 10));
  assert.ok(validateSlots(nine, 100, 100).errors.length > 0);
  assert.deepEqual(validateSlots(nine.slice(0, 8), 100, 100).errors, []);
});

test('slot keluar kanvas → error dan index-nya di slotErrors', () => {
  const r = validateSlots([slot(0, 0), slot(95, 0)], 100, 100);
  assert.deepEqual(r.slotErrors, [1]);
  assert.match(r.errors[0], /Slot 2/);
});

test('slot tepat di tepi kanan bawah valid', () => {
  assert.deepEqual(validateSlots([slot(90, 90)], 100, 100).errors, []);
});

test('w atau h = 0, string, pecahan, negatif → error', () => {
  for (const bad of [slot(0, 0, 0, 10), slot(0, 0, 10, 0), { x: '10', y: 0, w: 10, h: 10 }, slot(0.5, 0), slot(-1, 0)]) {
    const r = validateSlots([bad], 100, 100);
    assert.deepEqual(r.slotErrors, [0], JSON.stringify(bad));
  }
});

test('slot bukan objek → error, tidak melempar', () => {
  assert.deepEqual(validateSlots([null], 100, 100).slotErrors, [0]);
  assert.deepEqual(validateSlots([[1, 2, 3, 4]], 100, 100).slotErrors, [0]);
});

test('slots bukan array → error, tidak melempar', () => {
  for (const bad of [null, undefined, 'x', { length: 1 }]) assert.ok(validateSlots(bad, 100, 100).errors.length > 0);
});

test('tumpang tindih → overlaps [[0,1]], errors kosong', () => {
  const r = validateSlots([slot(0, 0, 20, 20), slot(10, 10, 20, 20)], 100, 100);
  assert.deepEqual(r.overlaps, [[0, 1]]);
  assert.deepEqual(r.errors, []);
});

test('bersentuhan tepi bukan tumpang tindih', () => {
  assert.deepEqual(validateSlots([slot(0, 0, 10, 10), slot(10, 0, 10, 10)], 100, 100).overlaps, []);
});
