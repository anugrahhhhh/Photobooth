// Validasi kanvas dan slot template. Murni, dipakai bersama browser dan server.

export const MAX_SIDE = 4000;
export const MAX_PIXELS = 12_000_000;
export const MAX_SLOTS = 8;

const isInt = Number.isInteger;

export function validateCanvas(w, h) {
  const errors = [];
  if (!isInt(w) || !isInt(h) || w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) {
    errors.push(`Ukuran kanvas harus bilangan bulat 1–${MAX_SIDE} px per sisi`);
  } else if (w * h > MAX_PIXELS) {
    errors.push('Kanvas terlalu besar (maksimal 12 juta piksel)');
  }
  return errors;
}

function slotProblem(s, w, h) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'tidak valid';
  if (![s.x, s.y, s.w, s.h].every(isInt)) return 'harus berisi bilangan bulat x, y, w, h';
  if (s.w <= 0 || s.h <= 0) return 'lebar dan tinggi harus lebih dari 0';
  if (s.x < 0 || s.y < 0 || s.x + s.w > w || s.y + s.h > h) return 'keluar dari kanvas';
  return null;
}

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// errors kosong = boleh disimpan/diaktifkan. overlaps hanya peringatan.
export function validateSlots(slots, w, h) {
  const errors = [];
  const slotErrors = [];
  const overlaps = [];
  if (!Array.isArray(slots)) return { errors: ['Daftar slot tidak valid'], slotErrors, overlaps };
  if (slots.length < 1 || slots.length > MAX_SLOTS) errors.push(`Jumlah slot harus 1–${MAX_SLOTS}`);

  slots.forEach((s, i) => {
    const problem = slotProblem(s, w, h);
    if (problem) {
      slotErrors.push(i);
      errors.push(`Slot ${i + 1} ${problem}`);
    }
  });

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (!slotErrors.includes(i) && !slotErrors.includes(j) && intersects(slots[i], slots[j])) overlaps.push([i, j]);
    }
  }
  return { errors, slotErrors, overlaps };
}
