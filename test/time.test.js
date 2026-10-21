import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBoundsUTC, localDate, addDays, dayBoundsUTCForDate } from '../lib/time.js';

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

test('localDate: Jakarta lewat tengah malam lokal', () => {
  assert.equal(localDate(new Date('2026-10-12T18:30:00Z'), 'Asia/Jakarta'), '2026-10-13');
  assert.equal(localDate(new Date('2026-10-12T16:59:59Z'), 'Asia/Jakarta'), '2026-10-12');
});

test('addDays: lintas bulan dan tahun', () => {
  assert.equal(addDays('2026-10-13', -13), '2026-09-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('dayBoundsUTCForDate: Jakarta dan hari 25 jam DST', () => {
  assert.deepEqual(dayBoundsUTCForDate('2026-10-13', 'Asia/Jakarta'), {
    start: '2026-10-12T17:00:00.000Z',
    end: '2026-10-13T17:00:00.000Z',
  });
  assert.deepEqual(dayBoundsUTCForDate('2026-11-01', 'America/New_York'), {
    start: '2026-11-01T04:00:00.000Z',
    end: '2026-11-02T05:00:00.000Z',
  });
});
