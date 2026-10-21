import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_PREFS, readThemePref, nextThemePref, resolveTheme } from '../public/js/theme.js';
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
