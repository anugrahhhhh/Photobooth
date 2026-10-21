import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage, isFrontCamera, createRestartPolicy } from '../public/js/camera.js';
import id from '../public/js/i18n/id.js';
import en from '../public/js/i18n/en.js';

const err = (name) => Object.assign(new Error('x'), { name });

test('cameraErrorMessage mengembalikan kunci i18n sesuai tabel', () => {
  assert.equal(cameraErrorMessage(err('InsecureContextError')), 'camera.error.insecure');
  assert.equal(cameraErrorMessage(err('NotAllowedError')), 'camera.error.denied');
  assert.equal(cameraErrorMessage(err('SecurityError')), 'camera.error.denied');
  assert.equal(cameraErrorMessage(err('NotFoundError')), 'camera.error.notFound');
  assert.equal(cameraErrorMessage(err('DevicesNotFoundError')), 'camera.error.notFound');
  assert.equal(cameraErrorMessage(err('NotReadableError')), 'camera.error.busy');
  assert.equal(cameraErrorMessage(err('TrackStartError')), 'camera.error.busy');
  assert.equal(cameraErrorMessage(err('AbortError')), 'camera.error.busy');
  assert.equal(cameraErrorMessage(err('AnehError')), 'camera.error.generic');
  assert.equal(cameraErrorMessage(null), 'camera.error.generic');
});

test('teks izin ditolak memberi panduan per browser, dan semua kunci ada di id dan en', () => {
  assert.match(id['camera.error.denied'], /Chrome/);
  assert.match(id['camera.error.denied'], /Safari/);
  for (const name of ['InsecureContextError', 'NotAllowedError', 'NotFoundError', 'NotReadableError', 'AnehError']) {
    const key = cameraErrorMessage(err(name));
    assert.ok(key in id, `id: ${key}`);
    assert.ok(key in en, `en: ${key}`);
  }
});

test('isFrontCamera: facing yang dilaporkan menang', () => {
  assert.equal(isFrontCamera({ facingRequested: 'user', reportedFacing: 'environment' }), false);
  assert.equal(isFrontCamera({ facingRequested: 'environment', reportedFacing: 'user' }), true);
});

test('isFrontCamera: laptop pilih deviceId tanpa facing → webcam (true)', () => {
  assert.equal(isFrontCamera({ facingRequested: 'environment', pickedByDeviceId: true, isTouch: false }), true);
});

test('isFrontCamera: ponsel deviceId tanpa facing → ikut facingRequested', () => {
  assert.equal(isFrontCamera({ facingRequested: 'environment', pickedByDeviceId: true, isTouch: true }), false);
  assert.equal(isFrontCamera({ facingRequested: 'user', pickedByDeviceId: false, isTouch: true }), true);
});

test('restartPolicy: 3 kali true, ke-4 false; success() mereset', () => {
  const p = createRestartPolicy(3);
  assert.deepEqual([p.shouldRetry(), p.shouldRetry(), p.shouldRetry(), p.shouldRetry()], [true, true, true, false]);
  p.success();
  assert.equal(p.shouldRetry(), true);
});
