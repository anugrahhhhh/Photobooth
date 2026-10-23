import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import id from '../public/js/i18n/id.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (relative(root, full).split(sep).join('/') === 'js/i18n') continue;
      out.push(...jsFiles(full));
    } else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function htmlKeys(html) {
  const keys = [];
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.push(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) {
      const key = pair.split(':')[1]?.trim();
      if (key) keys.push(key);
    }
  }
  return keys;
}

test('semua kunci yang dipakai di HTML dan JS ada di id.js', () => {
  const used = new Map(); // kunci -> sumber
  for (const file of ['index.html', 'booth.html', 'result.html']) {
    const full = join(root, file);
    if (!existsSync(full)) continue;
    for (const k of htmlKeys(readFileSync(full, 'utf8'))) used.set(k, file);
  }
  for (const file of jsFiles(join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.set(m[1], relative(root, file));
  }
  const missing = [...used].filter(([k]) => !(k in id)).map(([k, src]) => `${k} (${src})`);
  assert.deepEqual(missing, []);
});
