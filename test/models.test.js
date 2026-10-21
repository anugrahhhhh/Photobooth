import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotCountChips, filterBySlots } from '../public/js/booth/models.js';

const mk = (n, id) => ({ id, slots: Array.from({ length: n }, () => ({})) });
const list = [mk(3, 'a'), mk(2, 'b'), mk(3, 'c'), mk(4, 'd')];

test('slotCountChips: Semua + jumlah unik terurut naik', () => {
  assert.deepEqual(slotCountChips(list), [null, 2, 3, 4]);
  assert.deepEqual(slotCountChips([]), [null]);
});

test('filterBySlots menyaring per jumlah slot; null mengembalikan semua', () => {
  assert.deepEqual(filterBySlots(list, 3).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(filterBySlots(list, null), list);
  assert.deepEqual(filterBySlots(list, 9), []);
});
