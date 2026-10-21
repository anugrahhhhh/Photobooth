import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db/index.js';
import { bootstrapAdmin, seedAdmin } from '../db/seed-admin.js';

const users = (db) => db.prepare('SELECT username FROM users').all().map((u) => u.username);

test('bootstrapAdmin: env lengkap dan belum ada user → admin dibuat', async () => {
  const db = openDb(':memory:');
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'rahasia123' }), 'created');
  assert.deepEqual(users(db), ['admin']);
});

test('bootstrapAdmin: sudah ada user → tidak mengubah apa pun', async () => {
  const db = openDb(':memory:');
  await seedAdmin(db, { username: 'lama', password: 'password123' });
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'rahasia123' }), 'skipped');
  assert.deepEqual(users(db), ['lama']);
});

test('bootstrapAdmin: env tidak lengkap → dilewati', async () => {
  const db = openDb(':memory:');
  assert.equal(await bootstrapAdmin(db, {}), 'skipped');
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'admin' }), 'skipped');
  assert.deepEqual(users(db), []);
});

test('bootstrapAdmin: password terlalu pendek → melempar error', async () => {
  const db = openDb(':memory:');
  await assert.rejects(bootstrapAdmin(db, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pendek' }), /minimal 8/);
});
