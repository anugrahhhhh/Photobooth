import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, EXAMPLE_SESSION_SECRET } from '../config.js';

test('default development', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.dbPath, './data/photobooth.db');
  assert.equal(c.uploadDir, './uploads');
  assert.equal(c.tz, 'Asia/Jakarta');
  assert.equal(c.nodeEnv, 'development');
  assert.equal(c.isProd, false);
  assert.ok(c.sessionSecret.length > 0);
});

test('produksi tanpa SESSION_SECRET ditolak', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/);
});

test('produksi dengan secret contoh ditolak', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: EXAMPLE_SESSION_SECRET }),
    /SESSION_SECRET/,
  );
});

test('produksi dengan secret asli diterima', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }).isProd, true);
});

test('PORT bukan angka ditolak', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
});

test('TZ tidak dikenal ditolak', () => {
  assert.throws(() => loadConfig({ TZ: 'Mars/Olympus' }), /TZ/);
});
