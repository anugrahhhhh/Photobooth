import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readPngSize, readJpegSize } from '../lib/image-header.js';
import { openDb } from '../db/index.js';
import { createStorage } from '../storage/index.js';
import { encodePng, buildSamplePng, insertSample, SAMPLE_TEMPLATE, SAMPLE_THUMB_PATH } from '../db/seed-sample.js';

test('encodePng menghasilkan data piksel yang benar', () => {
  const buf = encodePng(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 0]));
  assert.deepEqual(readPngSize(buf), { width: 2, height: 1 });
  const idatAt = buf.indexOf('IDAT');
  const len = buf.readUInt32BE(idatAt - 4);
  const raw = zlib.inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + len));
  assert.deepEqual([...raw], [0, 255, 0, 0, 255, 0, 0, 255, 0]);
  assert.equal(buf.subarray(-8, -4).toString('ascii'), 'IEND');
});

test('buildSamplePng terbaca 1200x1800 dan < 5 MB', () => {
  const buf = buildSamplePng();
  assert.deepEqual(readPngSize(buf), { width: 1200, height: 1800 });
  assert.ok(buf.length < 5 * 1024 * 1024);
});

test('test/fixtures/thumb.jpg terbaca 267x400 dan ≤ 300 KB', () => {
  const buf = fs.readFileSync(SAMPLE_THUMB_PATH);
  assert.deepEqual(readJpegSize(buf), { width: 267, height: 400 });
  assert.ok(buf.length <= 300 * 1024);
});

test('insertSample menyimpan template aktif dengan photo_count 3 dan dua file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-seed-'));
  try {
    const db = openDb(':memory:');
    const storage = createStorage(dir);
    const id = await insertSample(db, storage);
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    assert.equal(row.status, 'active');
    assert.equal(row.photo_count, 3);
    assert.equal(row.canvas_w, SAMPLE_TEMPLATE.canvas_w);
    assert.deepEqual(JSON.parse(row.slots_json), SAMPLE_TEMPLATE.slots);
    assert.ok(fs.existsSync(path.join(dir, row.image_path)));
    assert.ok(fs.existsSync(path.join(dir, row.thumb_path)));
    assert.ok(fs.existsSync(SAMPLE_THUMB_PATH), 'fixture tidak boleh berpindah');
    assert.equal((await insertSample(db, storage, { status: 'inactive' })) > id, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
