import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBoundsUTC } from '../lib/time.js';

test('Jakarta: lewat tengah malam lokal', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-10-12T18:30:00Z'), 'Asia/Jakarta'), {
    start: '2026-10-12T17:00:00.000Z',
    end: '2026-10-13T17:00:00.000Z',
  });
});

test('Jakarta: satu detik sebelum tengah malam lokal', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-10-12T16:59:59Z'), 'Asia/Jakarta'), {
    start: '2026-10-11T17:00:00.000Z',
    end: '2026-10-12T17:00:00.000Z',
  });
});

test('zona dengan DST: hari 23 jam', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-03-08T12:00:00Z'), 'America/New_York'), {
    start: '2026-03-08T05:00:00.000Z',
    end: '2026-03-09T04:00:00.000Z',
  });
});

test('UTC: tepat tengah malam termasuk hari itu', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-10-12T00:00:00Z'), 'UTC'), {
    start: '2026-10-12T00:00:00.000Z',
    end: '2026-10-13T00:00:00.000Z',
  });
});
