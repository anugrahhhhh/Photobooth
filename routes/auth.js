import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { BCRYPT_COST } from '../db/seed-admin.js';

const LOGIN_FAILED = 'Username atau password salah';

// Dipakai saat username tidak ada, agar waktu respons sama dengan user yang ada.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export function authRouter({ db }) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    const { username, password } = req.body ?? {};
    const valid = typeof username === 'string' && typeof password === 'string';
    const user = valid ? db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) : undefined;
    const ok = await bcrypt.compare(valid ? password : '', user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: LOGIN_FAILED });

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ username: user.username });
    });
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('pb.sid');
      res.status(204).end();
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Silakan login' });
    res.json({ username: req.session.username });
  });

  return router;
}
