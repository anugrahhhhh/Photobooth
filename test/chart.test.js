import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barChartModel, formatDay } from '../public/admin/chart.js';

const daily = (counts) => counts.map((count, i) => ({ date: `2026-10-${String(i + 8).padStart(2, '0')}`, count }));

test('barChartModel: 14 batang, tinggi proporsional, hari ini = terakhir', () => {
  const counts = [...Array(12).fill(0), 5, 10];
  const { max, bars } = barChartModel(daily(counts), { width: 280, height: 100, gap: 4 });
  assert.equal(max, 10);
  assert.equal(bars.length, 14);
  const w = (280 - 13 * 4) / 14;
  for (const b of bars) {
    assert.equal(b.w, w);
    assert.equal(b.y + b.h, 100);
  }
  assert.equal(bars[13].h, 100);
  assert.equal(bars[13].today, true);
  assert.equal(bars[12].h, 50);
  assert.equal(bars[0].h, 2);
  assert.equal(bars.filter((b) => b.today).length, 1);
  assert.equal(bars[1].x, w + 4);
});

test('barChartModel: semua nol tanpa pembagian nol', () => {
  const { max, bars } = barChartModel(daily(Array(14).fill(0)), { width: 280, height: 100 });
  assert.equal(max, 0);
  assert.ok(bars.every((b) => b.h === 2 && b.y + b.h === 100));
});

test('formatDay: dd MMM Indonesia, tidak bergantung zona waktu', () => {
  assert.match(formatDay('2026-10-13'), /^13 Okt/);
  assert.match(formatDay('2026-01-01'), /^01 Jan/);
});
