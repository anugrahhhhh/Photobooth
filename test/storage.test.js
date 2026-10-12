import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../storage/index.js';

let dir;
let s;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-up-'));
  s = createStorage(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const KEY_RE = /^templates\/[0-9a-f-]{36}\.(png|jpg)$/;

test('createStorage membuat folder templates dan tmp', () => {
  assert.ok(fs.statSync(path.join(dir, 'templates')).isDirectory());
  assert.equal(s.tmpDir, path.join(dir, 'tmp'));
  assert.ok(fs.statSync(s.tmpDir).isDirectory());
});

test('save Buffer → file ada, key acak berformat templates/<uuid>.png', async () => {
  const key = await s.save(Buffer.from('abc'), 'png');
  assert.match(key, KEY_RE);
  assert.equal(fs.readFileSync(path.join(dir, key), 'utf8'), 'abc');
});

test('save dari path tmp → file dipindah', async () => {
  const tmp = path.join(s.tmpDir, 'upload-1');
  await writeFile(tmp, 'xyz');
  const key = await s.save(tmp, 'jpg');
  assert.match(key, KEY_RE);
  assert.equal(fs.existsSync(tmp), false);
  assert.equal(fs.readFileSync(path.join(dir, key), 'utf8'), 'xyz');
});

test('ekstensi selain png/jpg ditolak', async () => {
  await assert.rejects(s.save(Buffer.from('a'), 'html'));
});

test('dua save menghasilkan key berbeda', async () => {
  assert.notEqual(await s.save(Buffer.from('a'), 'png'), await s.save(Buffer.from('a'), 'png'));
});

test('urlFor', () => {
  assert.equal(s.urlFor('templates/abc.png'), '/uploads/templates/abc.png');
});

test('remove menghapus file; key tak ada tidak melempar', async () => {
  const key = await s.save(Buffer.from('a'), 'png');
  await s.remove(key);
  assert.equal(fs.existsSync(path.join(dir, key)), false);
  await s.remove('templates/tidak-ada.png');
});

test('remove menolak key yang keluar folder', async () => {
  const outside = path.join(dir, 'penting.txt');
  fs.writeFileSync(outside, 'jangan dihapus');
  await assert.rejects(s.remove('templates/../penting.txt'));
  await assert.rejects(s.remove('../penting.txt'));
  assert.ok(fs.existsSync(outside));
});

test('savePair berhasil → dua key', async () => {
  const { imageKey, thumbKey } = await s.savePair(Buffer.from('img'), Buffer.from('th'));
  assert.match(imageKey, /\.png$/);
  assert.match(thumbKey, /\.jpg$/);
  assert.equal((await readdir(path.join(dir, 'templates'))).length, 2);
});

test('savePair gagal di thumb → image yang sudah tersimpan dihapus', async () => {
  await assert.rejects(s.savePair(Buffer.from('img'), path.join(dir, 'tidak-ada.jpg')));
  assert.deepEqual(await readdir(path.join(dir, 'templates')), []);
});
