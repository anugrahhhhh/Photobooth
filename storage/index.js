import crypto from 'node:crypto';
import fs from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXTENSIONS = new Set(['png', 'jpg']);

// Penyimpanan disk lokal. Key berbentuk "templates/<uuid>.<ext>".
export function createStorage(uploadDir) {
  const root = path.resolve(uploadDir);
  const templatesDir = path.join(root, 'templates');
  const tmpDir = path.join(root, 'tmp');
  fs.mkdirSync(templatesDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  function resolveKey(key) {
    const full = path.resolve(root, key);
    if (path.dirname(full) !== templatesDir) throw new Error(`Key storage tidak valid: ${key}`);
    return full;
  }

  async function save(src, ext) {
    if (!EXTENSIONS.has(ext)) throw new Error(`Ekstensi tidak diizinkan: ${ext}`);
    const key = `templates/${crypto.randomUUID()}.${ext}`;
    const dest = resolveKey(key);
    if (Buffer.isBuffer(src)) await writeFile(dest, src, { flag: 'wx' });
    else await rename(src, dest);
    return key;
  }

  async function remove(key) {
    await rm(resolveKey(key), { force: true });
  }

  function urlFor(key) {
    return `/uploads/${key}`;
  }

  // Simpan keduanya atau tidak sama sekali.
  async function savePair(image, thumb) {
    const imageKey = await save(image, 'png');
    try {
      const thumbKey = await save(thumb, 'jpg');
      return { imageKey, thumbKey };
    } catch (err) {
      await remove(imageKey).catch(() => {});
      throw err;
    }
  }

  return { tmpDir, save, remove, urlFor, savePair };
}
