import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const CSS_URL = new URL('../public/css/tokens.css', import.meta.url);
const css = readFileSync(CSS_URL, 'utf8');

// Parsing assumptions (keep tokens.css in this shape):
//  - No nested rules. Each block is `selector { ... }` with no braces inside.
//  - One declaration per line: `--name: value;`. Comments are `/* ... */`.
//  - @font-face blocks are skipped; only blocks whose selector contains data-skin are read.
//  - A selector list (a, b) is not used; one selector per block.
function parseBlocks(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = {};
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector.includes('data-skin')) continue;
    const vars = {};
    for (const d of m[2].matchAll(/^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/gm)) vars[d[1]] = d[2];
    blocks[selector] = vars;
  }
  return blocks;
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-fA-F]{6}$/, `not a 6-digit hex: ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const blocks = parseBlocks(css);
const SEL = {
  funLight: '[data-skin="fun"]',
  funDark: '[data-skin="fun"][data-theme="dark"]',
  cleanLight: '[data-skin="clean"]',
  cleanDark: '[data-skin="clean"][data-theme="dark"]',
};
// Dark blocks only override; the effective map is light merged with dark.
const effective = {
  funLight: blocks[SEL.funLight],
  funDark: { ...blocks[SEL.funLight], ...blocks[SEL.funDark] },
  cleanLight: blocks[SEL.cleanLight],
  cleanDark: { ...blocks[SEL.cleanLight], ...blocks[SEL.cleanDark] },
};

test('keempat blok token ada', () => {
  for (const sel of Object.values(SEL)) assert.ok(blocks[sel], `blok hilang: ${sel}`);
});

const PAIRS = {
  fun: [['--ink', '--bg'], ['--ink', '--surface'], ['--muted', '--bg'], ['--muted', '--surface'], ['--on-primary', '--primary']],
  clean: [['--text', '--bg'], ['--text', '--surface'], ['--muted', '--surface'], ['--on-primary', '--primary']],
};
for (const [name, map] of Object.entries(effective)) {
  const skin = name.startsWith('fun') ? 'fun' : 'clean';
  for (const [fg, bg] of PAIRS[skin]) {
    test(`kontras ${name}: ${fg} di ${bg} >= 4.5`, () => {
      assert.ok(map[fg] && map[bg], `token hilang: ${fg} atau ${bg}`);
      const r = contrast(map[fg], map[bg]);
      assert.ok(r >= 4.5, `${map[fg]} di ${map[bg]} = ${r.toFixed(2)}`);
    });
  }
}

test('--primary persis dari spec (penjaga salin-tempel)', () => {
  assert.equal(effective.funLight['--primary'], '#FF5A4E');
  assert.equal(effective.cleanLight['--primary'], '#D93A2F');
});

test('semua token wajib ada di keempat blok', () => {
  for (const name of Object.keys(effective)) {
    const keys = ['--font-display', '--font-body', '--radius', '--tap', '--tap-lg', '--outline', '--shadow'];
    for (const k of keys) assert.ok(effective[name][k], `${name} tanpa ${k}`);
  }
  for (const name of ['funLight', 'funDark']) {
    for (const k of ['--line', '--shadow-lg', '--grid', '--accent', '--sun']) assert.ok(effective[name][k], `${name} tanpa ${k}`);
  }
});

test('setiap url() di @font-face menunjuk file yang ada di public/fonts', () => {
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
  assert.equal(faces.length, 4);
  for (const face of faces) {
    const urls = [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
    assert.ok(urls.length > 0);
    for (const u of urls) {
      assert.ok(u.startsWith('/fonts/') || u.startsWith('../fonts/'), `url tak terduga: ${u}`);
      const file = new URL(`../public/fonts/${u.split('/fonts/')[1]}`, import.meta.url);
      assert.ok(existsSync(file), `file hilang: ${u}`);
    }
  }
});
