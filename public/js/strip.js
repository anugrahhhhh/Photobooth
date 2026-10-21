import { clampTransform, photoRect, DEFAULT_TRANSFORM } from './geometry.js';

// Gambar photostrip: latar → foto per slot (di-clip) → PNG template paling akhir.
// filtered[i], bila ada, dipakai menggantikan photos[i] (salinan tersaring).
// mapPhoto(photo, i), bila ada, membuat salinan sementara per slot yang langsung dilepas setelah
// digambar, sehingga hanya satu salinan resolusi penuh yang hidup sekaligus (hemat memori ponsel).
export function render(canvas, { template, img, photos = [], transforms = [], filtered = [], scale = 1, mapPhoto }) {
  const w = Math.round(template.canvas_w * scale);
  const h = Math.round(template.canvas_h * scale);
  const ctx = canvas.getContext('2d');
  // Mengubah ukuran kanvas mereset bufernya dan mahal; bila ukuran sama cukup dibersihkan.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = template.bg_color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  template.slots.forEach((slot, i) => {
    const original = photos[i];
    const temp = mapPhoto && original?.width ? mapPhoto(original, i) : null;
    const photo = temp ?? filtered[i] ?? original;
    if (!photo || !photo.width || !photo.height) return;
    const t = clampTransform(transforms[i] ?? DEFAULT_TRANSFORM, photo.width, photo.height, slot);
    const r = photoRect(photo.width, photo.height, slot, t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x * scale, slot.y * scale, slot.w * scale, slot.h * scale);
    ctx.clip();
    ctx.drawImage(photo, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
    ctx.restore();
    if (temp) temp.width = temp.height = 0;
  });

  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

export function loadTemplateImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar template gagal dimuat'));
    img.src = url;
  });
}
