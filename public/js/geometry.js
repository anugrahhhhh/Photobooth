// Geometri murni untuk menempatkan foto di slot. Pan disimpan sebagai pecahan ukuran slot,
// sehingga transform yang sama berlaku untuk foto penuh maupun salinan kecil.

export const DEFAULT_TRANSFORM = Object.freeze({ panX: 0, panY: 0, zoom: 1 });
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function coverScale(photoW, photoH, slotW, slotH) {
  return Math.max(slotW / photoW, slotH / photoH);
}

export function clampTransform({ panX, panY, zoom }, photoW, photoH, slot) {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const s = coverScale(photoW, photoH, slot.w, slot.h) * z;
  const maxX = Math.max(0, (photoW * s - slot.w) / (2 * slot.w));
  const maxY = Math.max(0, (photoH * s - slot.h) / (2 * slot.h));
  return { panX: clamp(panX, -maxX, maxX), panY: clamp(panY, -maxY, maxY), zoom: z };
}

// Kotak foto dalam koordinat template.
export function photoRect(photoW, photoH, slot, { panX, panY, zoom }) {
  const s = coverScale(photoW, photoH, slot.w, slot.h) * zoom;
  const w = photoW * s;
  const h = photoH * s;
  const cx = slot.x + slot.w / 2 + panX * slot.w;
  const cy = slot.y + slot.h / 2 + panY * slot.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function fitWithin(w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export function previewScale(canvasW, canvasH, boxW, boxH, dpr) {
  return Math.min(boxW / canvasW, boxH / canvasH) * Math.min(dpr, 2);
}

// rect: getBoundingClientRect() kanvas; canvasPxW/H: ukuran piksel kanvas; scale: skala render.
export function clientToTemplate(clientX, clientY, rect, canvasPxW, canvasPxH, scale) {
  return {
    x: ((clientX - rect.left) * (canvasPxW / rect.width)) / scale,
    y: ((clientY - rect.top) * (canvasPxH / rect.height)) / scale,
  };
}

export function hitSlot(slots, { x, y }) {
  return slots.findIndex((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
}
