import { open, readFile, stat } from 'node:fs/promises';
import { HttpError } from './http-error.js';
import { isPng, readPngSize, isJpeg, readJpegSize } from './image-header.js';

export const MAX_THUMB_BYTES = 300 * 1024;
export const MAX_THUMB_SIDE = 600;
const MAX_NAME = 100;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const INT_RE = /^\d+$/;

function parseInt422(value, label) {
  if (typeof value !== 'string' || !INT_RE.test(value)) throw new HttpError(422, `${label} harus bilangan bulat`);
  return Number(value);
}

// Field teks dari multipart. Dipanggil setelah semua field dan file diterima.
export function parseTemplateFields(body, { requireCanvas }) {
  const b = body ?? {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > MAX_NAME) throw new HttpError(422, `Nama harus 1–${MAX_NAME} karakter`);

  if (typeof b.bg_color !== 'string' || !COLOR_RE.test(b.bg_color)) {
    throw new HttpError(422, 'Warna latar harus berformat #rrggbb');
  }

  let slots;
  try {
    slots = JSON.parse(b.slots);
  } catch {
    throw new HttpError(422, 'Format slot tidak valid');
  }
  if (!Array.isArray(slots)) throw new HttpError(422, 'Format slot tidak valid');

  const out = { name, bg_color: b.bg_color.toLowerCase(), slots };
  if (requireCanvas || b.canvas_w !== undefined || b.canvas_h !== undefined) {
    out.canvas_w = parseInt422(b.canvas_w, 'Lebar kanvas');
    out.canvas_h = parseInt422(b.canvas_h, 'Tinggi kanvas');
  }
  return out;
}

// Simpan hanya x, y, w, h (setelah validateSlots lolos).
export function normalizeSlots(slots) {
  return slots.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

async function readHead(file, bytes) {
  const fh = await open(file.path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function checkImageFile(file) {
  const head = await readHead(file, 33);
  if (!isPng(head)) throw new HttpError(400, 'File template harus PNG');
  const size = readPngSize(head);
  if (!size) throw new HttpError(400, 'File PNG tidak valid');
  return size;
}

export async function checkThumbFile(file) {
  const { size } = await stat(file.path);
  if (size > MAX_THUMB_BYTES) throw new HttpError(413, 'Thumbnail terlalu besar (maksimal 300 KB)');
  const buf = await readFile(file.path);
  if (!isJpeg(buf)) throw new HttpError(400, 'Thumbnail harus JPEG');
  const dims = readJpegSize(buf);
  if (!dims) throw new HttpError(400, 'File JPEG tidak valid');
  if (dims.width > MAX_THUMB_SIDE || dims.height > MAX_THUMB_SIDE) {
    throw new HttpError(422, `Sisi thumbnail maksimal ${MAX_THUMB_SIDE} px`);
  }
}
