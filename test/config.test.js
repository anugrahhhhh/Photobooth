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

test('mail dan whatsapp null tanpa env', () => {
  const c = loadConfig({});
  assert.equal(c.mail, null);
  assert.equal(c.whatsapp, null);
});

test('mail SMTP lengkap: from default ke SMTP_USER', () => {
  const c = loadConfig({ SMTP_HOST: 'smtp.x.com', SMTP_PORT: '465', SMTP_USER: 'a@x.com', SMTP_PASS: 'pw' });
  assert.deepEqual(c.mail, { host: 'smtp.x.com', port: 465, user: 'a@x.com', pass: 'pw', from: 'a@x.com', transport: 'smtp' });
});

test('mail SMTP_FROM menimpa from; SMTP tidak lengkap -> null', () => {
  const full = { SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'Booth <b@x.com>' };
  assert.equal(loadConfig(full).mail.from, 'Booth <b@x.com>');
  assert.equal(loadConfig({ ...full, SMTP_PASS: '' }).mail, null);
});

test('MAIL_TRANSPORT=json', () => {
  assert.deepEqual(loadConfig({ MAIL_TRANSPORT: 'json' }).mail, { transport: 'json', from: 'photobooth@localhost' });
});

test('whatsapp lengkap memakai apiBase default', () => {
  const c = loadConfig({ WA_PHONE_NUMBER_ID: '123', WA_ACCESS_TOKEN: 'tok', WA_TEMPLATE_NAME: 'tpl', WA_TEMPLATE_LANG: 'id' });
  assert.deepEqual(c.whatsapp, {
    phoneNumberId: '123', token: 'tok', template: 'tpl', lang: 'id', apiBase: 'https://graph.facebook.com/v21.0',
  });
  assert.equal(loadConfig({ WA_PHONE_NUMBER_ID: '123' }).whatsapp, null);
  assert.equal(loadConfig({ WA_PHONE_NUMBER_ID: '1', WA_ACCESS_TOKEN: 't', WA_TEMPLATE_NAME: 'n', WA_TEMPLATE_LANG: 'id', WA_API_BASE: 'http://x/' }).whatsapp.apiBase, 'http://x');
});
