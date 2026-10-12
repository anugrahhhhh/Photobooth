import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPng, readPngSize, isJpeg, readJpegSize } from '../lib/image-header.js';
import { encodePng } from '../db/seed-sample.js';
import { fakeJpeg } from './helpers.js';

const png = (w, h) => encodePng(w, h, () => [0, 0, 0, 0]);
const jpeg = (w, h, sof = 0xc0, before = []) => fakeJpeg(w, h, { sof, before });

test('PNG valid → ukuran dari IHDR', () => {
  const b = png(1200, 1800);
  assert.equal(isPng(b), true);
  assert.deepEqual(readPngSize(b), { width: 1200, height: 1800 });
});

test('PNG tanda tangan salah → null, isPng false', () => {
  const b = png(10, 10);
  b[1] = 0x00;
  assert.equal(isPng(b), false);
  assert.equal(readPngSize(b), null);
});

test('PNG terpotong (< 24 byte) → null', () => {
  assert.equal(readPngSize(png(10, 10).subarray(0, 20)), null);
});

test('PNG tanpa chunk IHDR pertama → null', () => {
  const b = png(10, 10);
  b.write('IDAT', 12, 'ascii');
  assert.equal(readPngSize(b), null);
});

test('JPEG baseline SOF0 setelah APP0 → ukuran', () => {
  assert.deepEqual(readJpegSize(jpeg(400, 300, 0xc0)), { width: 400, height: 300 });
});

test('JPEG progresif SOF2 → ukuran', () => {
  assert.deepEqual(readJpegSize(jpeg(600, 450, 0xc2)), { width: 600, height: 450 });
});

test('JPEG dengan marker DHT (C4) sebelum SOF tidak salah dibaca sebagai SOF', () => {
  const dht = [0xc4, Buffer.alloc(20, 0x01)];
  assert.deepEqual(readJpegSize(jpeg(320, 240, 0xc0, [dht])), { width: 320, height: 240 });
});

test('JPEG tanpa SOF → null', () => {
  const b = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]), Buffer.from([0xff, 0xda, 0, 2])]);
  assert.equal(readJpegSize(b), null);
});

test('JPEG terpotong di tengah segmen → null', () => {
  const b = jpeg(400, 300);
  assert.equal(readJpegSize(b.subarray(0, 25)), null);
});

test('isJpeg butuh FF D8 FF', () => {
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0x00])), false);
  assert.equal(isJpeg(Buffer.alloc(0)), false);
});
