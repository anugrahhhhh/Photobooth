import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error.js';
import { sniff } from '../lib/sniff.js';

export const RESULT_CREATE_LIMIT = 60;
const PHOTO_MAX = 8 * 1024 * 1024;
const GIF_MAX = '10mb';
const VIDEO_MAX = '30mb';
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

// Ambil hasil yang masih berlaku: 404 bila tidak ada, 410 bila kedaluwarsa.
function liveResult(store, token) {
  const row = store.get(token);
  if (!row) throw new HttpError(404, 'Hasil tidak ditemukan');
  if (row.expired) throw new HttpError(410, 'Hasil sudah kedaluwarsa');
  return row;
}

export function resultsApiRouter({ store, queue = null, services = { email: false, whatsapp: false } }) {
  // queue dan services dipakai endpoint send/deliveries (Task 3.3).
  void queue;
  void services;
  const router = Router();

  const assertDiskOk = async () => {
    if (!(await store.checkDisk()).ok) throw new HttpError(507, 'Penyimpanan penuh. Hubungi petugas.');
  };

  const createLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: RESULT_CREATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
  });
  const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PHOTO_MAX, files: 1, fields: 5 },
  }).single('photo');

  router.post('/', createLimiter, photoUpload, async (req, res) => {
    const { consent, lang, template_id: templateId } = req.body ?? {};
    if (consent !== '1') throw new HttpError(422, 'Persetujuan diperlukan');
    const photo = req.file?.buffer;
    if (!photo) throw new HttpError(422, 'Foto diperlukan');
    if (sniff(photo) !== 'jpg') throw new HttpError(422, 'Foto harus berformat JPEG');
    await assertDiskOk();
    const tid = Number(templateId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await store.create({
      photo,
      templateId: Number.isInteger(tid) && tid > 0 ? tid : null,
      lang: lang === 'en' ? 'en' : 'id',
      baseUrl,
    });
    res.status(201).json({
      token: result.token,
      key: result.key,
      url: `${baseUrl}/p/${result.token}`,
      expires_at: result.expiresAt,
    });
  });

  // Cek token, kedaluwarsa, lalu kunci unggah sebelum body dibaca.
  const authorize = async (req, res, next) => {
    const row = liveResult(store, req.params.token);
    if (!store.verifyKey(row, req.get('x-result-key'))) throw new HttpError(403, 'Kunci tidak valid');
    await assertDiskOk();
    next();
  };

  const putAsset = (kind, types, limit, allowed) => [
    authorize,
    express.raw({ type: types, limit }),
    async (req, res) => {
      const ext = sniff(req.body);
      if (!Buffer.isBuffer(req.body) || !allowed.includes(ext)) throw new HttpError(422, 'Format file tidak valid');
      await store.addAsset(req.params.token, kind, req.body, ext);
      res.status(204).end();
    },
  ];
  router.put('/:token/gif', ...putAsset('gif', ['image/gif'], GIF_MAX, ['gif']));
  router.put('/:token/video', ...putAsset('video', ['video/mp4', 'video/webm'], VIDEO_MAX, ['mp4', 'webm']));

  // Respons dibangun eksplisit: baris DB berisi key_hash dan tidak boleh diserialisasi.
  router.get('/:token', (req, res) => {
    const row = liveResult(store, req.params.token);
    const base = `/r/${row.token}`;
    res.json({
      created_at: row.created_at,
      expires_at: row.expires_at,
      lang: row.lang,
      photo_url: `${base}/photo.jpg`,
      gif_url: row.has_gif ? `${base}/anim.gif` : null,
      video_url: row.video_type ? `${base}/video.${row.video_type}` : null,
      video_type: row.video_type ?? null,
    });
  });

  router.get('/:token/qr.svg', async (req, res) => {
    const row = liveResult(store, req.params.token);
    const svg = await QRCode.toString(`${row.base_url}/p/${row.token}`, { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  });

  return router;
}

export function resultFilesRouter({ store }) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex');
    next();
  });

  router.get('/:token/:name', (req, res, next) => {
    const { token, name } = req.params;
    const row = store.get(token);
    if (!row) throw new HttpError(404, 'Tidak ditemukan');
    if (row.expired) throw new HttpError(410, 'Hasil sudah kedaluwarsa');
    let file;
    try {
      file = store.filePath(token, name);
    } catch {
      throw new HttpError(404, 'Tidak ditemukan');
    }
    // Header dipasang lewat opsi sendFile agar tidak ikut ke respons error.
    const headers = { 'Cache-Control': 'private, max-age=3600' };
    if (req.query.download === '1') {
      const date = req.app.locals.now().toISOString().slice(0, 10);
      headers['Content-Disposition'] = `attachment; filename="photobooth-${date}.${name.split('.').pop()}"`;
    }
    const dir = file.slice(0, file.length - name.length - 1);
    res.sendFile(name, { root: dir, cacheControl: false, dotfiles: 'deny', headers }, (err) => {
      if (err) next(err.code === 'ENOENT' ? new HttpError(404, 'Tidak ditemukan') : err);
    });
  });

  return router;
}

export function resultPageHandler(PUBLIC_DIR) {
  return (req, res, next) => {
    if (!TOKEN_RE.test(req.params.token)) return next(new HttpError(404, 'Tidak ditemukan'));
    res.set('X-Robots-Tag', 'noindex');
    res.sendFile('result.html', { root: PUBLIC_DIR });
  };
}
