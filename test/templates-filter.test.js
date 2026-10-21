import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTemplates } from '../public/admin/templates-filter.js';

const list = [
  { id: 1, name: 'Ulang Tahun', status: 'active' },
  { id: 2, name: 'Pernikahan', status: 'archived' },
  { id: 3, name: 'ulang lagi', status: 'inactive' },
];

test('filterTemplates: query tidak peka huruf besar/kecil dan dipangkas', () => {
  assert.deepEqual(filterTemplates(list, { query: '  ULANG ' }).map((t) => t.id), [1, 3]);
});

test('filterTemplates: filter status', () => {
  assert.deepEqual(filterTemplates(list, { status: 'archived' }).map((t) => t.id), [2]);
  assert.deepEqual(filterTemplates(list, { query: 'ulang', status: 'inactive' }).map((t) => t.id), [3]);
});

test('filterTemplates: query kosong dan all mengembalikan semua, urutan tetap', () => {
  assert.deepEqual(filterTemplates(list, { query: '   ', status: 'all' }), list);
  assert.deepEqual(filterTemplates(list), list);
});

test('filterTemplates: tidak ada yang cocok → kosong', () => {
  assert.deepEqual(filterTemplates(list, { query: 'zzz' }), []);
});
