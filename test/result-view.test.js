import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultButtonState, RESULT_PHASES } from '../public/js/booth/result-view.js';
import id from '../public/js/i18n/id.js';
import en from '../public/js/i18n/en.js';

test('fase hasil memetakan ke kunci dan status tombol', () => {
  assert.deepEqual(resultButtonState('preparing'), { key: 'booth.result.preparing', disabled: true });
  assert.deepEqual(resultButtonState('ready'), { key: 'booth.result.download', disabled: false });
  // gagal = tombol aktif sebagai "Coba lagi"
  assert.deepEqual(resultButtonState('failed'), { key: 'common.retry', disabled: false });
});

test('kunci tombol hasil ada di id.js dan en.js', () => {
  for (const phase of RESULT_PHASES) {
    const { key } = resultButtonState(phase);
    assert.ok(id[key], key);
    assert.ok(en[key], key);
  }
});
