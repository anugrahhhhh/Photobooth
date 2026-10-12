import { rm } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/http-error.js';
import {
  parseTemplateFields,
  normalizeSlots,
  checkImageFile,
  checkThumbFile,
} from '../lib/template-input.js';
import { validateCanvas, validateSlots } from '../public/js/slots.js';

const MAX_PNG_BYTES = 5 * 1024 * 1024;
const STATUSES = ['active', 'inactive', 'archived'];

export function parseId(raw) {
  return /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null;
}

export function toPublicJson(row, storage) {
  return {
    id: row.id,
    name: row.name,
    image_url: storage.urlFor(row.image_path),
    thumb_url: storage.urlFor(row.thumb_path),
    canvas_w: row.canvas_w,
    canvas_h: row.canvas_h,
    slots: JSON.parse(row.slots_json),
    bg_color: row.bg_color,
  };
}

export function toAdminJson(row, storage) {
  return {
    ...toPublicJson(row, storage),
    status: row.status,
    photo_count: row.photo_count,
    usage_count: row.usage_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const USAGE_SQL = '(SELECT COUNT(*) FROM session_logs l WHERE l.template_id = t.id) AS usage_count';

export function geometryErrors(canvasW, canvasH, slots) {
  return [...validateCanvas(canvasW, canvasH), ...validateSlots(slots, canvasW, canvasH).errors];
}

export function publicTemplatesRouter({ db, storage }) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare("SELECT * FROM templates WHERE status = 'active' ORDER BY created_at DESC, id DESC").all();
    res.json(rows.map((r) => toPublicJson(r, storage)));
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = id && db.prepare("SELECT * FROM templates WHERE id = ? AND status = 'active'").get(id);
    if (!row) throw new HttpError(404, 'Template tidak ditemukan');
    res.json(toPublicJson(row, storage));
  });

  return router;
}

export function adminTemplatesRouter({ db, storage }) {
  const router = Router();

  const uploadFields = multer({
    storage: multer.diskStorage({ destination: storage.tmpDir }),
    limits: { fileSize: MAX_PNG_BYTES, files: 2, fields: 10 },
  }).fields([
    { name: 'image', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]);

  const receive = (req, res) => new Promise((resolve, reject) => uploadFields(req, res, (err) => (err ? reject(err) : resolve())));

  async function removeTmp(req) {
    const files = Object.values(req.files ?? {}).flat();
    await Promise.all(files.map((f) => rm(f.path, { force: true })));
  }

  // Terima multipart, jalankan handler, lalu selalu bersihkan file tmp yang tersisa sebelum merespons.
  const withUpload = (handler) => async (req, res) => {
    let result;
    try {
      await receive(req, res);
      result = await handler(req, req.files?.image?.[0], req.files?.thumb?.[0]);
    } finally {
      await removeTmp(req);
    }
    res.status(result.status).json(result.body);
  };

  const getRow = (id) => db.prepare(`SELECT t.*, ${USAGE_SQL} FROM templates t WHERE t.id = ?`).get(id);

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT t.*, ${USAGE_SQL} FROM templates t ORDER BY t.created_at DESC, t.id DESC`).all();
    res.json(rows.map((r) => toAdminJson(r, storage)));
  });

  router.post(
    '/',
    withUpload(async (req, image, thumb) => {
      const input = parseTemplateFields(req.body, { requireCanvas: true });
      if (!image) throw new HttpError(422, 'File template PNG wajib diunggah');
      if (!thumb) throw new HttpError(422, 'Thumbnail wajib dikirim');
      const size = await checkImageFile(image);
      await checkThumbFile(thumb);
      if (size.width !== input.canvas_w || size.height !== input.canvas_h) {
        throw new HttpError(422, 'Ukuran PNG tidak sama dengan ukuran kanvas');
      }
      const errors = geometryErrors(input.canvas_w, input.canvas_h, input.slots);
      if (errors.length) throw new HttpError(422, errors.join('; '));

      const slots = normalizeSlots(input.slots);
      const { imageKey, thumbKey } = await storage.savePair(image.path, thumb.path);
      const now = new Date().toISOString();
      let id;
      try {
        id = db
          .prepare(
            `INSERT INTO templates (name, image_path, thumb_path, canvas_w, canvas_h, slots_json, photo_count, bg_color, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?)`,
          )
          .run(input.name, imageKey, thumbKey, input.canvas_w, input.canvas_h, JSON.stringify(slots), slots.length, input.bg_color, now, now)
          .lastInsertRowid;
      } catch (err) {
        await Promise.all([storage.remove(imageKey), storage.remove(thumbKey)]);
        throw err;
      }
      return { status: 201, body: toAdminJson(getRow(id), storage) };
    }),
  );

  const findOr404 = (rawId) => {
    const id = parseId(rawId);
    const row = id && getRow(id);
    if (!row) throw new HttpError(404, 'Template tidak ditemukan');
    return row;
  };

  // Urutan: validasi semua input → simpan file baru → update DB → hapus file lama.
  router.put(
    '/:id',
    withUpload(async (req, image, thumb) => {
      const row = findOr404(req.params.id);
      const input = parseTemplateFields(req.body, { requireCanvas: Boolean(image) });
      const canvasW = image ? input.canvas_w : row.canvas_w;
      const canvasH = image ? input.canvas_h : row.canvas_h;
      if (image) {
        const size = await checkImageFile(image);
        if (size.width !== canvasW || size.height !== canvasH) {
          throw new HttpError(422, 'Ukuran PNG tidak sama dengan ukuran kanvas');
        }
      }
      if (thumb) await checkThumbFile(thumb);
      const errors = geometryErrors(canvasW, canvasH, input.slots);
      if (errors.length) throw new HttpError(422, errors.join('; '));

      const slots = normalizeSlots(input.slots);
      const slotsJson = JSON.stringify(slots);
      const slotsChanged = slotsJson !== JSON.stringify(normalizeSlots(JSON.parse(row.slots_json)));
      const bgChanged = input.bg_color !== row.bg_color;
      if ((image || slotsChanged || bgChanged) && !thumb) {
        throw new HttpError(422, 'Thumbnail wajib dikirim ulang saat PNG, slot, atau warna latar berubah');
      }

      const newKeys = {};
      if (image) Object.assign(newKeys, await storage.savePair(image.path, thumb.path));
      else if (thumb) newKeys.thumbKey = await storage.save(thumb.path, 'jpg');

      const status = image || slotsChanged ? 'inactive' : row.status;
      try {
        db.prepare(
          `UPDATE templates SET name = ?, image_path = ?, thumb_path = ?, canvas_w = ?, canvas_h = ?, slots_json = ?,
             photo_count = ?, bg_color = ?, status = ?, updated_at = ? WHERE id = ?`,
        ).run(
          input.name,
          newKeys.imageKey ?? row.image_path,
          newKeys.thumbKey ?? row.thumb_path,
          canvasW,
          canvasH,
          slotsJson,
          slots.length,
          input.bg_color,
          status,
          new Date().toISOString(),
          row.id,
        );
      } catch (err) {
        await Promise.all(Object.values(newKeys).map((k) => storage.remove(k)));
        throw err;
      }

      const oldKeys = [newKeys.imageKey && row.image_path, newKeys.thumbKey && row.thumb_path].filter(Boolean);
      await Promise.all(oldKeys.map((k) => storage.remove(k).catch((err) => console.error('Gagal menghapus file lama', k, err))));
      return { status: 200, body: toAdminJson(getRow(row.id), storage) };
    }),
  );

  router.patch('/:id/status', (req, res) => {
    const row = findOr404(req.params.id);
    const status = req.body?.status;
    if (!STATUSES.includes(status)) throw new HttpError(422, 'Status harus active, inactive, atau archived');
    if (status === 'active') {
      let slots;
      try {
        slots = JSON.parse(row.slots_json);
      } catch {
        throw new HttpError(422, 'Slot template tidak valid');
      }
      const errors = geometryErrors(row.canvas_w, row.canvas_h, slots);
      if (errors.length) throw new HttpError(422, `Template belum bisa diaktifkan: ${errors.join('; ')}`);
    }
    db.prepare('UPDATE templates SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), row.id);
    res.json(toAdminJson(getRow(row.id), storage));
  });

  router.delete('/:id', async (req, res) => {
    const row = findOr404(req.params.id);
    if (row.usage_count > 0) throw new HttpError(409, 'Template sudah dipakai; arsipkan saja');
    db.prepare('DELETE FROM templates WHERE id = ?').run(row.id);
    await Promise.all([storage.remove(row.image_path), storage.remove(row.thumb_path)]);
    res.status(204).end();
  });

  return router;
}
