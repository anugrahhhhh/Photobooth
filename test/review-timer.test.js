import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewTimer, shouldReview } from '../public/js/booth/review-timer.js';

test('timer berjalan, menyusut, lalu habis', () => {
  let t = 0;
  const timer = createReviewTimer({ durationMs: 3000, now: () => t });
  assert.equal(timer.tick(), 'running');
  assert.equal(timer.fraction(), 1);
  t = 1500;
  assert.equal(timer.fraction(), 0.5);
  t = 3000;
  assert.equal(timer.tick(), 'expired');
  assert.equal(timer.fraction(), 0);
});

test('cancel menang atas waktu', () => {
  let t = 0;
  const timer = createReviewTimer({ durationMs: 3000, now: () => t });
  timer.cancel();
  t = 5000;
  assert.equal(timer.tick(), 'cancelled');
});

test('shouldReview', () => {
  assert.equal(shouldReview(0, 'camera'), false);
  assert.equal(shouldReview(3, 'gallery'), false);
  assert.equal(shouldReview(3, 'camera'), true);
});
