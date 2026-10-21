import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdleTimer } from '../public/js/idle.js';

// jam palsu: t diubah langsung oleh tes
function setup() {
  const clock = { t: 0 };
  const timer = createIdleTimer({
    timeoutMs: 90_000,
    warnMs: 10_000,
    now: () => clock.t,
  });
  return { clock, timer };
}

test('tick berganti idle → warn → expired sesuai timeout dan warnMs', () => {
  const { clock, timer } = setup();
  clock.t = 79_999;
  assert.equal(timer.tick(), 'idle');
  clock.t = 80_000;
  assert.equal(timer.tick(), 'warn');
  clock.t = 90_000;
  assert.equal(timer.tick(), 'expired');
  clock.t = 120_000;
  assert.equal(timer.tick(), 'expired');
});

test('expired bertahan sampai activity()', () => {
  const { clock, timer } = setup();
  clock.t = 100_000;
  assert.equal(timer.tick(), 'expired');
  timer.activity();
  assert.equal(timer.tick(), 'idle');
});

test('activity() mengulang hitungan dari waktu aktivitas', () => {
  const { clock, timer } = setup();
  clock.t = 85_000;
  timer.activity();
  assert.equal(timer.tick(), 'idle');
  clock.t = 165_000;
  assert.equal(timer.tick(), 'warn');
});

test('pause() menahan jam: tick selalu idle selama dijeda', () => {
  const { clock, timer } = setup();
  clock.t = 10_000;
  timer.pause();
  assert.equal(timer.paused(), true);
  clock.t = 200_000;
  assert.equal(timer.tick(), 'idle');
});

test('resume() memulai jam dari nol', () => {
  const { clock, timer } = setup();
  clock.t = 10_000;
  timer.pause();
  clock.t = 200_000;
  timer.resume();
  assert.equal(timer.paused(), false);
  clock.t = 279_999;
  assert.equal(timer.tick(), 'idle');
  clock.t = 289_999;
  assert.equal(timer.tick(), 'warn');
  clock.t = 290_000;
  assert.equal(timer.tick(), 'expired');
});

test('resume() membatalkan status expired dari sebelum jeda', () => {
  const { clock, timer } = setup();
  clock.t = 100_000;
  assert.equal(timer.tick(), 'expired');
  timer.pause();
  clock.t = 110_000;
  timer.resume();
  clock.t = 110_000;
  assert.equal(timer.tick(), 'idle');
});

test('jeda bertingkat: resume kedua yang menutup jeda, bukan yang pertama', () => {
  const { clock, timer } = setup();
  clock.t = 10_000;
  timer.pause();
  timer.pause();
  clock.t = 50_000;
  timer.resume();
  assert.equal(timer.paused(), true);
  clock.t = 200_000;
  assert.equal(timer.tick(), 'idle');
  timer.resume();
  assert.equal(timer.paused(), false);
  clock.t = 200_000;
  assert.equal(timer.tick(), 'idle');
  clock.t = 290_000;
  assert.equal(timer.tick(), 'expired');
});

test('resume() berlebih tidak membuat hitungan negatif', () => {
  const { clock, timer } = setup();
  timer.resume();
  timer.resume();
  assert.equal(timer.paused(), false);
  timer.pause();
  assert.equal(timer.paused(), true);
  timer.resume();
  assert.equal(timer.paused(), false);
});

test('activity() saat dijeda tetap mereset jam, dan tidak mengubah jeda', () => {
  const { clock, timer } = setup();
  clock.t = 0;
  timer.pause();
  clock.t = 100_000;
  timer.activity();
  assert.equal(timer.paused(), true);
  assert.equal(timer.tick(), 'idle');
  timer.resume();
  clock.t = 179_999;
  assert.equal(timer.tick(), 'idle');
  clock.t = 190_000;
  assert.equal(timer.tick(), 'expired');
});

test('timeoutMs boleh fungsi dan dibaca ulang tiap tick', () => {
  const clock = { t: 0 };
  let timeout = 90_000;
  const timer = createIdleTimer({ timeoutMs: () => timeout, warnMs: 10_000, now: () => clock.t });
  clock.t = 40_000;
  assert.equal(timer.tick(), 'idle');
  timeout = 45_000; // pengaturan server datang belakangan
  assert.equal(timer.tick(), 'warn');
  clock.t = 45_000;
  assert.equal(timer.tick(), 'expired');
});
