import { photoRect, clampTransform, DEFAULT_TRANSFORM } from '../geometry.js';
import { filteredCanvas } from '../filters.js';
import { releaseCanvas } from '../state.js';

export const GIF_MAX_SIDE = 640;
export const GIF_DELAY_MS = 600;

// Rencana bingkai: satu per slot berfoto, dalam piksel GIF (sisi slot terpanjang = maxSide).
// Murni (tanpa DOM) supaya bisa diuji di Node.
export function planGifFrames(template, photos, transforms, maxSide = GIF_MAX_SIDE) {
  const frames = [];
  template.slots.forEach((slot, i) => {
    const photo = photos[i];
    if (!photo) return;
    const k = maxSide / Math.max(slot.w, slot.h);
    const t = clampTransform(transforms[i] ?? DEFAULT_TRANSFORM, photo.width, photo.height, slot);
    const r = photoRect(photo.width, photo.height, slot, t);
    frames.push({
      slot: i,
      w: Math.round(slot.w * k),
      h: Math.round(slot.h * k),
      dx: (r.x - slot.x) * k,
      dy: (r.y - slot.y) * k,
      dw: r.w * k,
      dh: r.h * k,
    });
  });
  return frames;
}

function runWorker(frames) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/js/media/gif-worker.js', { type: 'module' });
    const done = (fn, v) => {
      worker.terminate();
      fn(v);
    };
    worker.onmessage = (e) => (e.data?.ok ? done(resolve, e.data.buffer) : done(reject, new Error(e.data?.error ?? 'gif')));
    worker.onerror = (e) => done(reject, new Error(e.message || 'worker'));
    worker.postMessage({ frames, delay: GIF_DELAY_MS }, frames.map((f) => f.data.buffer));
  });
}

export async function buildGif({ template, photos, transforms, filter }) {
  const plan = planGifFrames(template, photos, transforms);
  if (plan.length === 0) throw new Error('Tidak ada foto');
  // Semua bingkai berukuran sama (slot bisa berbeda ukuran): kanvas = yang terbesar, bingkai di tengah.
  const W = Math.max(...plan.map((f) => f.w));
  const H = Math.max(...plan.map((f) => f.h));
  const frames = [];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c2d = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (const f of plan) {
      const photo = photos[f.slot];
      const filtered = filteredCanvas(photo, filter, Math.ceil(Math.max(f.dw, f.dh)));
      const ox = Math.round((W - f.w) / 2);
      const oy = Math.round((H - f.h) / 2);
      c2d.fillStyle = template.bg_color;
      c2d.fillRect(0, 0, W, H);
      c2d.save();
      c2d.beginPath();
      c2d.rect(ox, oy, f.w, f.h);
      c2d.clip();
      c2d.imageSmoothingQuality = 'high';
      c2d.drawImage(filtered ?? photo, ox + f.dx, oy + f.dy, f.dw, f.dh);
      c2d.restore();
      releaseCanvas(filtered);
      const { data } = c2d.getImageData(0, 0, W, H);
      frames.push({ width: W, height: H, data });
    }
  } finally {
    releaseCanvas(canvas);
  }
  const buffer = await runWorker(frames);
  return new Blob([buffer], { type: 'image/gif' });
}
