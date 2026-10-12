import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error.js';
import { dayBoundsUTC } from '../lib/time.js';

// Semua tamu di satu booth berbagi IP yang sama, jadi batasnya longgar.
export const SESSION_LOG_LIMIT = 120;
const SESSION_LOG_WINDOW_MS = 10 * 60_000;

export function sessionsRouter({ db }) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: SESSION_LOG_WINDOW_MS,
    limit: SESSION_LOG_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
  });

  router.post('/', limiter, (req, res) => {
    const id = req.body?.template_id;
    if (!Number.isInteger(id) || id < 1) throw new HttpError(422, 'template_id tidak valid');
    const tpl = db.prepare("SELECT id, photo_count FROM templates WHERE id = ? AND status = 'active'").get(id);
    if (!tpl) throw new HttpError(422, 'Template tidak tersedia');
    db.prepare('INSERT INTO session_logs (template_id, photo_count, created_at) VALUES (?, ?, ?)').run(
      tpl.id,
      tpl.photo_count,
      new Date().toISOString(),
    );
    res.status(201).json({ ok: true });
  });

  return router;
}

export function adminStatsRouter({ db, tz, now }) {
  const router = Router();

  router.get('/', (req, res) => {
    const templates = { active: 0, inactive: 0, archived: 0 };
    for (const { status, n } of db.prepare('SELECT status, COUNT(*) AS n FROM templates GROUP BY status').all()) {
      templates[status] = n;
    }
    const { start, end } = dayBoundsUTC(now(), tz);
    const { n: sessionsToday } = db
      .prepare('SELECT COUNT(*) AS n FROM session_logs WHERE created_at >= ? AND created_at < ?')
      .get(start, end);
    const top = db
      .prepare(
        `SELECT t.id, t.name, COUNT(*) AS count FROM session_logs l JOIN templates t ON t.id = l.template_id
         GROUP BY t.id ORDER BY count DESC, t.id ASC LIMIT 5`,
      )
      .all();
    res.json({ templates, sessions_today: sessionsToday, top });
  });

  return router;
}
