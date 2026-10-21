import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator, initialLang } from '../public/js/i18n.js';
import id from '../public/js/i18n/id.js';
import en from '../public/js/i18n/en.js';
import { FILTERS } from '../public/js/filters.js';

test('t mengganti penanda {nama}; penanda tanpa parameter dibiarkan', () => {
  const { t } = createTranslator({ id: { x: 'Foto {i} dari {n}', y: 'Halo {nama}' }, en: {} });
  assert.equal(t('x', { i: 2, n: 3 }), 'Foto 2 dari 3');
  assert.equal(t('y', { i: 1 }), 'Halo {nama}');
});

test('kunci hilang jatuh ke id, lalu ke nama kunci, dan warn sekali per kunci', () => {
  const warnings = [];
  const { t } = createTranslator({ id: { a: 'A-id' }, en: {} }, { lang: 'en', warn: (m) => warnings.push(m) });
  assert.equal(t('a'), 'A-id');
  assert.equal(t('tidak.ada'), 'tidak.ada');
  assert.equal(t('tidak.ada'), 'tidak.ada');
  assert.equal(warnings.length, 1);
});

test('setLang mengganti bahasa', () => {
  const tr = createTranslator({ id: { a: 'A' }, en: { a: 'B' } });
  assert.equal(tr.t('a'), 'A');
  tr.setLang('en');
  assert.equal(tr.getLang(), 'en');
  assert.equal(tr.t('a'), 'B');
});

test('kamus en punya kunci yang sama dengan id dan tidak ada nilai kosong', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(id).sort());
  for (const dict of [id, en]) {
    for (const [k, v] of Object.entries(dict)) assert.ok(typeof v === 'string' && v.trim() !== '', k);
  }
});

test('setiap filter punya kunci filter.<id>', () => {
  for (const f of FILTERS) assert.ok(`filter.${f.id}` in id, f.id);
});

test('initialLang: stored, deviceDefault, bahasa browser, lalu id', () => {
  assert.equal(initialLang({ stored: 'en' }), 'en');
  assert.equal(initialLang({ stored: 'fr', deviceDefault: 'en' }), 'en');
  assert.equal(initialLang({ navigatorLang: 'en-GB' }), 'en');
  assert.equal(initialLang({ navigatorLang: 'ms-MY' }), 'id');
  assert.equal(initialLang({}), 'id');
});
