import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { getSettings, SETTINGS_SCHEMA } from '../db/index.js';
import { hasKioskPin } from './kiosk.js';

export function publicSettingsRouter({ db, services = { email: false, whatsapp: false } }) {
  const router = Router();
  router.get('/', (req, res) => res.json({ ...getSettings(db), kiosk_available: hasKioskPin(db), share_email: services.email, share_whatsapp: services.whatsapp }));
  return router;
}

export function adminSettingsRouter({ db }) {
  const router = Router();

  // Validasi semua kunci dulu, lalu tulis dalam satu transaksi.
  router.put('/', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Body harus berupa objek');
    const unknown = Object.keys(body).filter((k) => !Object.hasOwn(SETTINGS_SCHEMA, k));
    if (unknown.length) throw new HttpError(400, `Pengaturan tidak dikenal: ${unknown.join(', ')}`);
    for (const [key, value] of Object.entries(body)) {
      const { min, max } = SETTINGS_SCHEMA[key];
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new HttpError(422, `${key} harus bilangan bulat ${min}–${max}`);
      }
    }
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    db.transaction(() => {
      for (const [key, value] of Object.entries(body)) upsert.run(key, String(value));
    })();
    res.json(getSettings(db));
  });

  return router;
}
