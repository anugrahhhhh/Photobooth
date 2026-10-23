import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVideoMime, canRecord, finishSessionRecording, waitSessionVideo } from '../public/js/media/recorder.js';

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

// ctx tiruan: recorder.stop() selesai saat `finish` dipanggil.
function fakeCtx() {
  let finish;
  const ctx = { session: { video: null, videoPending: null } };
  ctx.recorder = { stop: () => new Promise((r) => (finish = r)) };
  return { ctx, finish: (out) => finish(out) };
}

test('waitSessionVideo: klip yang selesai sebelum batas waktu dipakai', async () => {
  const { ctx, finish } = fakeCtx();
  finishSessionRecording(ctx);
  const waiting = waitSessionVideo(ctx.session, 1000);
  finish({ blob: 'b', ext: 'webm' });
  await waiting;
  assert.deepEqual(ctx.session.video, { blob: 'b', ext: 'webm' });
  assert.equal(ctx.session.videoPending, null);
});

test('waitSessionVideo: melewati batas waktu = tanpa video, klip yang terlambat dibuang', async () => {
  const { ctx, finish } = fakeCtx();
  finishSessionRecording(ctx);
  await waitSessionVideo(ctx.session, 20);
  assert.equal(ctx.session.videoPending, null);
  finish({ blob: 'late', ext: 'webm' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ctx.session.video, null);
});

test('waitSessionVideo: tanpa rekaman langsung selesai', async () => {
  await waitSessionVideo({ video: null, videoPending: null }, 1000);
});
