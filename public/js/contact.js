// Normalisasi dan masking kontak. Murni, dipakai bersama browser dan server.

const PHONE_RE = /^[1-9]\d{9,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;

// Buang semua selain angka. Awalan 0 jadi 62. Hasil harus cocok PHONE_RE.
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  return PHONE_RE.test(digits) ? digits : null;
}

export function isValidEmail(input) {
  return typeof input === 'string' && input.length <= MAX_EMAIL && EMAIL_RE.test(input);
}

export function normalizeEmail(input) {
  return String(input).trim().toLowerCase();
}

// 2 karakter pertama bagian lokal, lalu ***, lalu domain.
export function maskEmail(email) {
  const at = email.indexOf('@');
  if (at < 0) return '***';
  return email.slice(0, Math.min(2, at)) + '***' + email.slice(at);
}

// 4 digit awal dan 4 digit akhir. Nomor pendek ditutup seluruhnya.
export function maskPhone(phone) {
  if (phone.length < 9) return '****';
  return phone.slice(0, 4) + '****' + phone.slice(-4);
}
