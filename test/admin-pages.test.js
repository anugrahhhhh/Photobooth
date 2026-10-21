import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestApp } from './helpers.js';

const ADMIN_DIR = path.resolve(import.meta.dirname, '..', 'public', 'admin');
const PAGES = ['login', 'dashboard', 'templates', 'template-edit', 'settings'];

for (const name of PAGES) {
  test(`admin/${name}.html: kulit clean, admin.js, tanpa app.css`, () => {
    const file = path.join(ADMIN_DIR, `${name}.html`);
    assert.ok(fs.existsSync(file), 'file ada');
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /data-skin="clean"/);
    assert.match(html, /\/admin\/admin\.js/);
    assert.match(html, /<main id="content"|<main[^>]*id="content"/);
    assert.doesNotMatch(html, /\/css\/app\.css/);
  });
}

test('templates.html dan settings.html dilayani (200)', async () => {
  const ctx = await makeTestApp();
  try {
    for (const p of ['templates', 'settings']) {
      const res = await request(ctx.app).get(`/admin/${p}.html`);
      assert.equal(res.status, 200, p);
    }
  } finally {
    ctx.cleanup();
  }
});
