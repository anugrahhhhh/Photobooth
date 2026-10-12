import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = path.resolve(import.meta.dirname, '..', 'public');

function htmlFiles() {
  if (!fs.existsSync(PUBLIC)) return [];
  return fs
    .readdirSync(PUBLIC, { recursive: true })
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, fs.readFileSync(path.join(PUBLIC, f), 'utf8')]);
}

test('tidak ada atribut on* di public/**/*.html', () => {
  for (const [file, html] of htmlFiles()) assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i, file);
});

test('setiap <script> di public/**/*.html memakai src', () => {
  for (const [file, html] of htmlFiles()) assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, file);
});
