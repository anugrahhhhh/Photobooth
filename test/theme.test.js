import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { THEME_PREFS, readThemePref, nextThemePref, resolveTheme, defaultThemeLabel } from '../public/js/theme.js';
import { PRODUCT_NAME } from '../public/js/brand.js';

test('PRODUCT_NAME', () => assert.equal(PRODUCT_NAME, 'Photobooth'));

test('nextThemePref berputar system -> light -> dark -> system', () => {
  assert.deepEqual(THEME_PREFS, ['system', 'light', 'dark']);
  assert.equal(nextThemePref('system'), 'light');
  assert.equal(nextThemePref('light'), 'dark');
  assert.equal(nextThemePref('dark'), 'system');
});

test('resolveTheme', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('readThemePref: nilai tak dikenal atau storage melempar -> system', () => {
  assert.equal(readThemePref({ getItem: () => 'ungu' }), 'system');
  assert.equal(readThemePref({ getItem: () => 'dark' }), 'dark');
  assert.equal(readThemePref({ getItem() { throw new Error('x'); } }), 'system');
});

function runBoot({ pref, dark, storageThrows }) {
  const attrs = {};
  const ctx = {
    localStorage: { getItem() { if (storageThrows) throw new Error('x'); return pref; } },
    window: { matchMedia: () => ({ matches: dark }) },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
  };
  vm.runInNewContext(readFileSync(new URL('../public/js/theme-boot.js', import.meta.url), 'utf8'), ctx);
  return attrs['data-theme'];
}

test('theme-boot: storage melempar + OS gelap -> dark', () => {
  assert.equal(runBoot({ dark: true, storageThrows: true }), 'dark');
});

test('theme-boot: pilihan dan sistem', () => {
  assert.equal(runBoot({ pref: 'light', dark: true }), 'light');
  assert.equal(runBoot({ pref: 'dark', dark: false }), 'dark');
  assert.equal(runBoot({ pref: 'ungu', dark: true }), 'dark');
  assert.equal(runBoot({ pref: null, dark: false }), 'light');
});

test('defaultThemeLabel: label Indonesia bawaan untuk halaman admin', () => {
  assert.equal(defaultThemeLabel('system'), 'Tema: ikuti sistem');
  assert.equal(defaultThemeLabel('light'), 'Tema: terang');
  assert.equal(defaultThemeLabel('dark'), 'Tema: gelap');
});
