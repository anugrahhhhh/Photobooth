import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../db/index.js';
import { createStorage } from '../storage/index.js';
import { backup } from '../scripts/backup.js';

test('backup menyalin DB dan semua file template ke backups/<tanggal>/', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-bak-'));
  try {
    const uploadDir = path.join(root, 'uploads');
    const db = openDb(':memory:');
    db.prepare("INSERT INTO settings (key, value) VALUES ('countdown_seconds', '7') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const storage = createStorage(uploadDir);
    const key = await storage.save(Buffer.from('png'), 'png');

    const dir = await backup({ db, uploadDir, outRoot: path.join(root, 'backups'), date: new Date(2026, 9, 12, 8, 5, 9) });
    assert.equal(path.basename(dir), '2026-10-12-080509');

    const copy = new Database(path.join(dir, 'photobooth.db'), { readonly: true });
    assert.equal(copy.prepare("SELECT value FROM settings WHERE key = 'countdown_seconds'").get().value, '7');
    copy.close();
    assert.equal(fs.readFileSync(path.join(dir, 'uploads', key), 'utf8'), 'png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
