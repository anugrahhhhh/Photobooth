import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isValidEmail, normalizeEmail, maskEmail, maskPhone } from '../public/js/contact.js';

test('normalizePhone membuang non-angka dan mengganti awalan 0 dengan 62', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalizePhone('6281234567890'), '6281234567890');
  assert.equal(normalizePhone('+1 415 555 2671'), '14155552671');
});

test('normalizePhone menolak nomor yang tidak valid', () => {
  assert.equal(normalizePhone('08123'), null);
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone(''), null);
});

test('normalizeEmail trim dan huruf kecil', () => {
  assert.equal(normalizeEmail(' Rina@Gmail.com '), 'rina@gmail.com');
});

test('isValidEmail menerima alamat yang benar dan menolak yang salah', () => {
  assert.equal(isValidEmail('rina@gmail.com'), true);
  assert.equal(isValidEmail('rina@gmail'), false);
  assert.equal(isValidEmail('ri na@gmail.com'), false);
  assert.equal(isValidEmail('@gmail.com'), false);
  assert.equal(isValidEmail('a'.repeat(245) + '@gmail.com'), false);
});

test('maskEmail menyisakan 2 karakter lokal', () => {
  assert.equal(maskEmail('rina.putri@gmail.com'), 'ri***@gmail.com');
  assert.equal(maskEmail('a@x.co'), 'a***@x.co');
});

test('maskPhone menyisakan 4 digit awal dan akhir', () => {
  assert.equal(maskPhone('6281234567890'), '6281****7890');
});

test('normalizePhone menangani (0) setelah kode negara dan awalan 00', () => {
  assert.equal(normalizePhone('+62 (0)812 3456 7890'), '6281234567890');
  assert.equal(normalizePhone('0062 812 3456 7890'), '6281234567890');
});

test('isValidEmail menolak karakter yang membuat daftar alamat', () => {
  for (const bad of ['a,b@c.com', 'x@y.com;z@w.com', '"a"@b.com', '<a@b.com>', 'a@b.com, c@d.com', 'a b@c.com', 'a@b']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
  assert.equal(isValidEmail('rina.putri+booth@gmail.com'), true);
});

test('normalizePhone: setelah awalan 00 dibuang, nomor kurang dari 11 digit ditolak', () => {
  assert.equal(normalizePhone('008123456789'), null);
  assert.equal(normalizePhone('0062 812 3456 7890'), '6281234567890');
  assert.equal(normalizePhone('001 415 555 2671'), '14155552671');
});
