import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVideoMime, canRecord } from '../public/js/media/recorder.js';

test('pickVideoMime: memilih webm vp8 bila hanya itu yang didukung', () => {
  assert.deepEqual(pickVideoMime((m) => m === 'video/webm;codecs=vp8'), { mime: 'video/webm;codecs=vp8', ext: 'webm' });
});

test('pickVideoMime: mp4 diutamakan', () => {
  assert.deepEqual(pickVideoMime((m) => m.startsWith('video/mp4')), { mime: 'video/mp4;codecs=avc1', ext: 'mp4' });
});

test('pickVideoMime: tidak ada yang didukung = null', () => {
  assert.equal(pickVideoMime(() => false), null);
});

test('canRecord: tanpa MediaRecorder = false', () => {
  assert.equal(canRecord({}), false);
});

test('canRecord: butuh captureStream dan mime yang didukung', () => {
  const MediaRecorder = { isTypeSupported: (m) => m === 'video/webm' };
  const HTMLCanvasElement = { prototype: { captureStream() {} } };
  assert.equal(canRecord({ MediaRecorder, HTMLCanvasElement }), true);
  assert.equal(canRecord({ MediaRecorder, HTMLCanvasElement: { prototype: {} } }), false);
  assert.equal(canRecord({ MediaRecorder: { isTypeSupported: () => false }, HTMLCanvasElement }), false);
});
