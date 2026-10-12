import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage, isFrontCamera, createRestartPolicy } from '../public/js/camera.js';

const err = (name) => Object.assign(new Error('x'), { name });

test('cameraErrorMessage sesuai tabel spec', () => {
  assert.match(cameraErrorMessage(err('InsecureContextError')), /HTTPS/);
  assert.match(cameraErrorMessage(err('NotAllowedError')), /izin/i);
  assert.match(cameraErrorMessage(err('NotFoundError')), /tidak ditemukan/i);
  assert.match(cameraErrorMessage(err('NotReadableError')), /aplikasi lain/i);
  assert.match(cameraErrorMessage(err('AnehError')), /tidak bisa/i);
  assert.match(cameraErrorMessage(null), /tidak bisa/i);
});

test('NotAllowedError memberi panduan per browser', () => {
  const m = cameraErrorMessage(err('NotAllowedError'));
  assert.match(m, /Chrome/);
  assert.match(m, /Safari|iPhone/);
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
