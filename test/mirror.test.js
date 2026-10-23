import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMirror } from '../public/js/booth/mirror.js';

test('kamera belakang tidak pernah dicermin', () => {
  assert.equal(initialMirror({ front: false, stored: '1', settingDefault: 1 }), false);
});
test('kamera depan memakai pilihan tersimpan', () => {
  assert.equal(initialMirror({ front: true, stored: '0', settingDefault: 1 }), false);
  assert.equal(initialMirror({ front: true, stored: '1', settingDefault: 0 }), true);
});
test('tanpa pilihan valid memakai default pengaturan', () => {
  assert.equal(initialMirror({ front: true, stored: null, settingDefault: 1 }), true);
  assert.equal(initialMirror({ front: true, stored: 'x', settingDefault: 0 }), false);
});
