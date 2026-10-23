import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { sanitize } from '../lib/delivery-queue.js';
import { isValidEmail, normalizeEmail } from '../public/js/contact.js';

export function adminResultsRouter({ store, queue, services, mailer, secrets = [] }) {
  const router = Router();

  router.get('/results/summary', async (req, res) => {
    const { count, bytes } = store.summary();
    const { total, free } = await store.checkDisk();
    res.json({
      count,
      bytes,
      disk_total: total,
      disk_free: free,
      deliveries_7d: queue.stats7d(),
      services,
    });
  });

  router.delete('/results', async (req, res) => {
    await store.removeAll();
    res.status(204).end();
  });

  router.post('/test-email', async (req, res) => {
    const raw = req.body?.to;
    const to = typeof raw === 'string' ? normalizeEmail(raw) : '';
    if (!isValidEmail(to)) throw new HttpError(422, 'Alamat email tidak valid');
    if (!mailer) throw new HttpError(409, 'Layanan email belum diatur');
    try {
      await mailer.sendTest(to);
    } catch (err) {
      // Dijawab langsung (bukan lewat error handler) agar galat SMTP tidak tercatat mentah di log.
      return res.status(502).json({ error: `Gagal mengirim email uji: ${sanitize(err, secrets)}` });
    }
    res.status(204).end();
  });

  return router;
}
