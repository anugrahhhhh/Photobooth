import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../public/js/api.js';
import { isKioskOn, setKioskOn, deviceLang, setDeviceLang, pinErrorKey } from '../public/js/kiosk.js';
import id from '../public/js/i18n/id.js';
import en from '../public/js/i18n/en.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const brokenStore = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };

test('pinErrorKey memetakan status ke kunci', () => {
  assert.deepEqual(pinErrorKey(new ApiError(429, 'x', 120)), { key: 'kiosk.pin.limited', params: { m: 2 } });
  assert.deepEqual(pinErrorKey(new ApiError(429, 'x', 61)), { key: 'kiosk.pin.limited', params: { m: 2 } });
  assert.deepEqual(pinErrorKey(new ApiError(429, 'x', null)), { key: 'kiosk.pin.limited', params: { m: 15 } });
  assert.equal(pinErrorKey(new ApiError(0, 'x')).key, 'kiosk.pin.offline');
  assert.equal(pinErrorKey(new ApiError(401, 'x')).key, 'kiosk.pin.wrong');
  assert.equal(pinErrorKey(new Error()).key, 'kiosk.pin.error');
  assert.equal(pinErrorKey(new ApiError(500, 'x')).key, 'kiosk.pin.error');
});

test('semua kunci pinErrorKey dan kiosk.* ada di id.js dan en.js', () => {
  const errs = [new ApiError(401, 'x'), new ApiError(429, 'x', 1), new ApiError(0, 'x'), new Error()];
  for (const e of errs) {
    const { key } = pinErrorKey(e);
    assert.ok(id[key], key);
    assert.ok(en[key], key);
  }
  assert.equal(id['kiosk.pin.offline'], 'Tidak bisa memeriksa PIN. Periksa koneksi.');
  assert.equal(id['kiosk.needPin'], 'Mode kiosk butuh PIN. Atur PIN di halaman Pengaturan admin.');
});

test('isKioskOn dan setKioskOn', () => {
  const s = memStore();
  assert.equal(isKioskOn(s), false);
  setKioskOn(true, s);
  assert.equal(isKioskOn(s), true);
  setKioskOn(false, s);
  assert.equal(isKioskOn(s), false);
  assert.equal(isKioskOn(brokenStore), false);
  assert.doesNotThrow(() => setKioskOn(true, brokenStore));
});

test('deviceLang hanya id, en, atau null', () => {
  const s = memStore();
  assert.equal(deviceLang(s), null);
  setDeviceLang('en', s);
  assert.equal(deviceLang(s), 'en');
  setDeviceLang(null, s);
  assert.equal(deviceLang(s), null);
  s.setItem('pb.kioskLang', 'fr');
  assert.equal(deviceLang(s), null);
});
