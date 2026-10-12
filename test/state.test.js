import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, changeTemplate, wouldDrop, nextEmptySlot, resetPhotos, resetAll, releaseCanvas } from '../public/js/state.js';

const canvas = () => ({ width: 10, height: 10 });
const tpl = (n) => ({ id: n, slots: Array.from({ length: n }, (_, i) => ({ x: i, y: 0, w: 1, h: 1 })) });

function withPhotos(n, slots = n) {
  const s = createState();
  changeTemplate(s, tpl(slots));
  for (let i = 0; i < n; i++) s.photos[i] = canvas();
  return s;
}

test('createState sesuai bentuk spec', () => {
  assert.deepEqual(createState(), {
    template: null,
    settings: null,
    photos: [],
    transforms: [],
    filter: 'normal',
    facingRequested: 'user',
    logged: false,
  });
});

test('releaseCanvas mengosongkan ukuran; null aman', () => {
  const c = canvas();
  releaseCanvas(c);
  assert.deepEqual(c, { width: 0, height: 0 });
  releaseCanvas(null);
});

test('changeTemplate 3→2 slot: dropped 1, foto ke-3 dilepas, transforms default', () => {
  const s = withPhotos(3);
  const third = s.photos[2];
  s.transforms[0] = { panX: 0.2, panY: 0, zoom: 2 };
  s.logged = true;
  assert.equal(wouldDrop(s, tpl(2)), 1);
  assert.deepEqual(changeTemplate(s, tpl(2)), { dropped: 1 });
  assert.equal(s.photos.length, 2);
  assert.equal(third.width, 0);
  assert.deepEqual(s.transforms, [
    { panX: 0, panY: 0, zoom: 1 },
    { panX: 0, panY: 0, zoom: 1 },
  ]);
  assert.equal(s.logged, false);
  assert.equal(s.template.id, 2);
});

test('changeTemplate 2→4: foto tetap, nextEmptySlot = 2', () => {
  const s = withPhotos(2, 2);
  const kept = [...s.photos];
  assert.deepEqual(changeTemplate(s, tpl(4)), { dropped: 0 });
  assert.equal(s.photos[0], kept[0]);
  assert.equal(s.photos[1], kept[1]);
  assert.equal(nextEmptySlot(s), 2);
  assert.equal(s.transforms.length, 4);
});

test('wouldDrop tidak mengubah state', () => {
  const s = withPhotos(3);
  wouldDrop(s, tpl(1));
  assert.equal(s.photos.length, 3);
  assert.equal(s.photos[2].width, 10);
});

test('nextEmptySlot: lubang di tengah, penuh → -1, tanpa template → -1', () => {
  const s = withPhotos(3);
  assert.equal(nextEmptySlot(s), -1);
  s.photos[1] = null;
  assert.equal(nextEmptySlot(s), 1);
  assert.equal(nextEmptySlot(createState()), -1);
});

test('resetPhotos melepas semua canvas, template tetap', () => {
  const s = withPhotos(2);
  const photos = [...s.photos];
  s.logged = true;
  resetPhotos(s);
  assert.ok(photos.every((p) => p.width === 0));
  assert.deepEqual(s.photos, []);
  assert.equal(s.transforms.length, 2);
  assert.equal(s.template.id, 2);
  assert.equal(s.logged, false);
});

test('resetAll melepas semua canvas dan mengosongkan template serta filter', () => {
  const s = withPhotos(2);
  const photos = [...s.photos];
  s.filter = 'bw';
  s.settings = { countdown_seconds: 3, mirror_output: 0 };
  resetAll(s);
  assert.ok(photos.every((p) => p.width === 0));
  assert.equal(s.template, null);
  assert.deepEqual(s.photos, []);
  assert.deepEqual(s.transforms, []);
  assert.equal(s.filter, 'normal');
  assert.deepEqual(s.settings, { countdown_seconds: 3, mirror_output: 0 }, 'pengaturan tetap');
});
