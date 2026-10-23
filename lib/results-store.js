import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const RESULT_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_FREE_BYTES = 100 * 1024 * 1024;
const MIN_FREE_RATIO = 0.15;

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const FILE_NAMES = new Set(['photo.jpg', 'anim.gif', 'video.mp4', 'video.webm']);
const VIDEO_EXTS = ['mp4', 'webm'];

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createResultsStore({ db, uploadDir, now = () => new Date(), statfs = fs.promises.statfs, remove = rm }) {
  const root = path.resolve(uploadDir);
  const resultsDir = path.join(root, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });

  // Token divalidasi dulu sebelum dipakai membangun path.
  function dirFor(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new Error('Token tidak valid');
    return path.join(resultsDir, token);
  }

  function filePath(token, name) {
    if (!FILE_NAMES.has(name)) throw new Error(`Nama file tidak diizinkan: ${name}`);
    return path.join(dirFor(token), name);
  }

  // Tulis lewat file sementara lalu rename, supaya kegagalan tidak meninggalkan sisa.
  async function writeAtomic(dest, buf) {
    const tmp = `${dest}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(tmp, buf);
      await rename(tmp, dest);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async function create({ photo, templateId, lang, baseUrl }) {
    const token = crypto.randomBytes(16).toString('base64url');
    const key = crypto.randomBytes(32).toString('base64url');
    const created = now();
    const expiresAt = new Date(created.getTime() + RESULT_TTL_DAYS * DAY_MS).toISOString();
    const dir = dirFor(token);
    await mkdir(dir, { recursive: true });
    try {
      await writeAtomic(path.join(dir, 'photo.jpg'), photo);
      db.prepare(
        `INSERT INTO results (token, key_hash, template_id, lang, base_url, bytes, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(token, sha256(key), templateId ?? null, lang, baseUrl, photo.length, created.toISOString(), expiresAt);
    } catch (err) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
    return { token, key, expiresAt };
  }

  function get(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const row = db
      .prepare(
        `SELECT id, token, key_hash, lang, base_url, has_gif, video_type, created_at, expires_at
         FROM results WHERE token = ?`,
      )
      .get(token);
    if (!row) return null;
    return { ...row, expired: row.expires_at <= now().toISOString() };
  }

  function verifyKey(row, key) {
    if (!row || typeof key !== 'string' || key === '') return false;
    const a = Buffer.from(sha256(key), 'hex');
    const b = Buffer.from(row.key_hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function addAsset(token, kind, buf, ext) {
    const row = get(token);
    if (!row) throw new Error('Hasil tidak ditemukan');
    let name;
    if (kind === 'gif' && ext === 'gif') name = 'anim.gif';
    else if (kind === 'video' && VIDEO_EXTS.includes(ext)) name = `video.${ext}`;
    else throw new Error(`Aset tidak valid: ${kind}/${ext}`);
    const dest = filePath(token, name);
    await writeAtomic(dest, buf);
    if (kind === 'video') {
      for (const other of VIDEO_EXTS) {
        if (other !== ext) await rm(filePath(token, `video.${other}`), { force: true });
      }
    }
    const dir = dirFor(token);
    let bytes = 0;
    for (const f of fs.readdirSync(dir)) {
      if (FILE_NAMES.has(f)) bytes += fs.statSync(path.join(dir, f)).size;
    }
    if (kind === 'gif') {
      db.prepare('UPDATE results SET has_gif = 1, bytes = ? WHERE id = ?').run(bytes, row.id);
    } else {
      db.prepare('UPDATE results SET video_type = ?, bytes = ? WHERE id = ?').run(ext, bytes, row.id);
    }
  }

  async function checkDisk() {
    const s = await statfs(root);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { ok: free >= Math.max(MIN_FREE_BYTES, total * MIN_FREE_RATIO), total, free };
  }

  // Gagal pada satu hasil tidak boleh menghentikan yang lain; baris DB dipertahankan agar dicoba lagi.
  async function cleanup() {
    const rows = db.prepare('SELECT id, token FROM results WHERE expires_at <= ?').all(now().toISOString());
    let removed = 0;
    for (const { id, token } of rows) {
      try {
        await remove(dirFor(token), { recursive: true, force: true });
        db.prepare('DELETE FROM results WHERE id = ?').run(id);
        removed++;
      } catch (err) {
        console.warn(`Gagal membersihkan hasil ${token}: ${err.message}`);
      }
    }
    return removed;
  }

  function summary() {
    const { count, bytes } = db
      .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM results')
      .get();
    return { count, bytes };
  }

  async function removeAll() {
    db.prepare('DELETE FROM results').run();
    await rm(resultsDir, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });
  }

  return { create, get, verifyKey, addAsset, filePath, checkDisk, cleanup, summary, removeAll };
}
