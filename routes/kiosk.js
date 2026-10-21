import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { BCRYPT_COST } from '../db/seed-admin.js';
import { HttpError } from '../lib/http-error.js';

export const KIOSK_PIN_KEY = 'kiosk_pin_hash';
export const KIOSK_VERIFY_LIMIT = 5;

const PIN_RE = /^\d{4,8}$/;
const PIN_FAILED = 'PIN salah';

// Dipakai saat PIN belum diatur atau body tidak valid, agar waktu respons sama.
const DUMMY_HASH = bcrypt.hashSync('dummy-pin-for-timing', BCRYPT_COST);

const isValidPin = (pin) => typeof pin === 'string' && PIN_RE.test(pin);

function getPinHash(db) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(KIOSK_PIN_KEY)?.value ?? null;
}

export function hasKioskPin(db) {
  return getPinHash(db) !== null;
}

export function kioskAdminRouter({ db }) {
  const router = Router();

  router.put('/', async (req, res) => {
    const body = req.body;
    const pin = body && typeof body === 'object' ? body.pin : undefined;
    if (pin === null) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(KIOSK_PIN_KEY);
      return res.status(204).end();
    }
    if (!isValidPin(pin)) throw new HttpError(422, 'PIN harus 4–8 digit angka, atau null untuk menghapus');
    const hash = await bcrypt.hash(pin, BCRYPT_COST);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      KIOSK_PIN_KEY,
      hash,
    );
    res.status(204).end();
  });

  return router;
}

export function kioskPublicRouter({ db }) {
  const router = Router();

  // Hanya percobaan gagal yang dihitung, agar petugas yang sering memasukkan PIN benar tidak terkunci.
  const verifyLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: KIOSK_VERIFY_LIMIT,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan PIN. Coba lagi nanti.' },
  });

  router.post('/verify', verifyLimiter, async (req, res) => {
    const pin = req.body?.pin;
    const valid = isValidPin(pin);
    const hash = getPinHash(db);
    const match = await bcrypt.compare(valid ? pin : '', hash ?? DUMMY_HASH);
    if (!hash || !valid || !match) return res.status(401).json({ error: PIN_FAILED });
    res.json({ ok: true });
  });

  return router;
}
