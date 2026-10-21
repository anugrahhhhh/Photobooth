import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { openDb, getSettings } from '../db/index.js';
import { seedAdmin } from '../db/seed-admin.js';

const now = () => new Date().toISOString();

function insertTemplate(db, status = 'inactive') {
  return db
    .prepare(
      `INSERT INTO templates (name, image_path, thumb_path, canvas_w, canvas_h, slots_json, photo_count, status, created_at, updated_at)
       VALUES ('t', 'templates/a.png', 'templates/a.jpg', 100, 100, '[]', 0, ?, ?, ?)`,
    )
    .run(status, now(), now()).lastInsertRowid;
}

test('pragma foreign_keys aktif', () => {
  assert.equal(openDb(':memory:').pragma('foreign_keys', { simple: true }), 1);
});

test('migrasi idempotent dan folder induk dibuat', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-db-'));
  const file = path.join(dir, 'nested', 'x.db');
  openDb(file).close();
  const db = openDb(file);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('default settings terisi', () => {
  assert.deepEqual(getSettings(openDb(':memory:')), {
    countdown_seconds: 3,
    mirror_output: 0,
    kiosk_idle_seconds: 90,
    review_seconds: 3,
    sound_default: 1,
  });
});

test('bg_color default #ffffff', () => {
  const db = openDb(':memory:');
  const id = insertTemplate(db);
  assert.equal(db.prepare('SELECT bg_color FROM templates WHERE id = ?').get(id).bg_color, '#ffffff');
});

test('status template di luar enum ditolak CHECK', () => {
  const db = openDb(':memory:');
  assert.throws(() => insertTemplate(db, 'deleted'), /CHECK/);
});

test('session_logs dengan template_id tak ada ditolak FK', () => {
  const db = openDb(':memory:');
  assert.throws(
    () => db.prepare('INSERT INTO session_logs (template_id, photo_count, created_at) VALUES (999, 1, ?)').run(now()),
    /FOREIGN KEY/,
  );
});

test('indeks session_logs(created_at) dan (template_id) ada', () => {
  const db = openDb(':memory:');
  const cols = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'session_logs'")
    .all()
    .map((r) => db.prepare(`PRAGMA index_info(${JSON.stringify(r.name)})`).all().map((c) => c.name).join(','));
  assert.ok(cols.includes('created_at'));
  assert.ok(cols.includes('template_id'));
});

test('seedAdmin membuat user dengan hash bcrypt, role admin', async () => {
  const db = openDb(':memory:');
  await seedAdmin(db, { username: 'admin', password: 'password123' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  assert.equal(u.role, 'admin');
  assert.ok(await bcrypt.compare('password123', u.password_hash));
  assert.match(u.created_at, /Z$/);
});

test('seedAdmin user sudah ada tanpa reset → throw; dengan reset → hash berubah', async () => {
  const db = openDb(':memory:');
  await seedAdmin(db, { username: 'admin', password: 'password123' });
  await assert.rejects(seedAdmin(db, { username: 'admin', password: 'password456' }), /sudah ada/);
  await seedAdmin(db, { username: 'admin', password: 'password456', reset: true });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  assert.ok(await bcrypt.compare('password456', u.password_hash));
});

test('seedAdmin --reset untuk user yang belum ada → throw', async () => {
  const db = openDb(':memory:');
  await assert.rejects(seedAdmin(db, { username: 'nobody', password: 'password123', reset: true }), /tidak ditemukan/);
});

test('seedAdmin password < 8 karakter → throw', async () => {
  const db = openDb(':memory:');
  await assert.rejects(seedAdmin(db, { username: 'admin', password: 'short' }), /8/);
});
