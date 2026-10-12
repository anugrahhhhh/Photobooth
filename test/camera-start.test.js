import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Lingkungan browser palsu untuk camera.start(): getUserMedia bisa diselesaikan manual dan tidak berurutan.
let pending;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function fakeStream(name) {
  const track = {
    name,
    readyState: 'live',
    onended: null,
    stop() {
      this.readyState = 'ended';
    },
    getSettings: () => ({ deviceId: name }),
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

const video = { play: async () => {}, setAttribute() {} };

beforeEach(() => {
  pending = [];
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => pending.push(resolve)) } },
  });
});

afterEach(async () => {
  const camera = await import('../public/js/camera.js');
  camera.stop();
  delete globalThis.window;
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
});

test('dua start bersamaan: stream yang kalah dihentikan, hanya yang terakhir hidup', async () => {
  const camera = await import('../public/js/camera.js');
  const first = camera.start(video, { facingMode: 'user' });
  const second = camera.start(video, { facingMode: 'environment' });
  await new Promise((r) => setImmediate(r));
  const [s1, s2] = [fakeStream('a'), fakeStream('b')];
  pending[0](s1);
  pending[1](s2);
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1, null, 'start yang tersusul mengembalikan null');
  assert.equal(r2.deviceId, 'b');
  assert.equal(s1.track.readyState, 'ended', 'stream lama tidak boleh bocor');
  assert.equal(s2.track.readyState, 'live');
});

test('start yang tersusul selesai belakangan tetap dihentikan dan tidak menimpa stream aktif', async () => {
  const camera = await import('../public/js/camera.js');
  const first = camera.start(video, {});
  const second = camera.start(video, {});
  await new Promise((r) => setImmediate(r));
  const [s1, s2] = [fakeStream('a'), fakeStream('b')];
  pending[1](s2);
  assert.equal((await second).deviceId, 'b');
  pending[0](s1);
  assert.equal(await first, null);
  assert.equal(s1.track.readyState, 'ended');
  assert.equal(s2.track.readyState, 'live');
  camera.stop();
  assert.equal(s2.track.readyState, 'ended', 'stop() menghentikan stream yang benar-benar aktif');
});

test('stop() selama start masih menunggu: stream yang datang langsung dihentikan', async () => {
  const camera = await import('../public/js/camera.js');
  const p = camera.start(video, {});
  await new Promise((r) => setImmediate(r));
  camera.stop();
  const s = fakeStream('a');
  pending[0](s);
  assert.equal(await p, null);
  assert.equal(s.track.readyState, 'ended');
  assert.equal(camera.isLive(), false);
});
