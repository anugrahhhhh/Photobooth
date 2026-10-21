import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../public/js/strip.js';

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy(
    { calls },
    {
      get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
      set: (t, k, v) => ((t[k] = v), true),
    },
  );
  return { width: 0, height: 0, getContext: () => ctx, calls };
}

const template = {
  canvas_w: 100,
  canvas_h: 300,
  bg_color: '#fff',
  slots: [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 0, y: 100, w: 100, h: 100 },
    { x: 0, y: 200, w: 100, h: 100 },
  ],
};
const photo = (n) => ({ name: n, width: 192, height: 108 });

test('mapPhoto: salinan sementara dibuat satu per satu dan dilepas setelah digambar', () => {
  const canvas = fakeCanvas();
  const photos = [photo('a'), photo('b'), photo('c')];
  let live = 0;
  let maxLive = 0;
  const copies = [];
  render(canvas, {
    template,
    img: null,
    photos,
    scale: 1,
    mapPhoto: (p) => {
      const copy = { name: `${p.name}*`, width: p.width, height: p.height };
      copies.push(copy);
      live = copies.filter((c) => c.width > 0).length;
      maxLive = Math.max(maxLive, live);
      return copy;
    },
  });
  assert.equal(copies.length, 3);
  assert.equal(maxLive, 1, 'paling banyak satu salinan hidup sekaligus');
  assert.ok(copies.every((c) => c.width === 0 && c.height === 0), 'semua salinan dilepas');
  const drawn = canvas.calls.filter(([k]) => k === 'drawImage').map(([, src]) => src.name);
  assert.deepEqual(drawn, ['a*', 'b*', 'c*']);
  assert.ok(photos.every((p) => p.width === 192), 'foto asli tidak disentuh');
});

test('mapPhoto mengembalikan null → foto asli digambar dan tidak dilepas', () => {
  const canvas = fakeCanvas();
  const photos = [photo('a'), null, photo('c')];
  render(canvas, { template, img: null, photos, scale: 1, mapPhoto: () => null });
  const drawn = canvas.calls.filter(([k]) => k === 'drawImage').map(([, src]) => src.name);
  assert.deepEqual(drawn, ['a', 'c']);
  assert.equal(photos[0].width, 192);
});

test('tanpa mapPhoto: filtered[i] dipakai dan tidak dilepas', () => {
  const canvas = fakeCanvas();
  const filtered = [{ name: 'fa', width: 96, height: 54 }];
  render(canvas, { template, img: null, photos: [photo('a')], filtered, scale: 1 });
  const drawn = canvas.calls.filter(([k]) => k === 'drawImage').map(([, src]) => src.name);
  assert.deepEqual(drawn, ['fa']);
  assert.equal(filtered[0].width, 96);
});

test('render dua kali dengan skala sama: width ditulis sekali, kedua kali dibersihkan', () => {
  const canvas = fakeCanvas();
  const writes = [];
  let w = 0;
  let h = 0;
  Object.defineProperty(canvas, 'width', { get: () => w, set: (v) => (writes.push('width'), (w = v)) });
  Object.defineProperty(canvas, 'height', { get: () => h, set: (v) => (writes.push('height'), (h = v)) });
  render(canvas, { template, img: null, photos: [], scale: 1 });
  render(canvas, { template, img: null, photos: [], scale: 1 });
  assert.equal(writes.filter((k) => k === 'width').length, 1);
  assert.equal(writes.filter((k) => k === 'height').length, 1);
  const names = canvas.calls.map((c) => c[0]);
  assert.equal(names.filter((n) => n === 'clearRect').length, 1);
  const i = names.indexOf('clearRect');
  assert.deepEqual(canvas.calls[i - 1], ['setTransform', 1, 0, 0, 1, 0, 0]);
  assert.deepEqual(canvas.calls[i], ['clearRect', 0, 0, 100, 300]);
  assert.ok(names.indexOf('fillRect', i) > i, 'latar diisi setelah dibersihkan');
});

test('render dengan skala berbeda mengubah ukuran lagi', () => {
  const canvas = fakeCanvas();
  render(canvas, { template, img: null, photos: [], scale: 1 });
  render(canvas, { template, img: null, photos: [], scale: 0.5 });
  assert.equal(canvas.width, 50);
  assert.equal(canvas.height, 150);
});
