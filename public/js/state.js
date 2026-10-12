import { DEFAULT_TRANSFORM } from './geometry.js';

// State satu sesi booth. photos[i] = canvas frame kamera penuh untuk slot i (null = kosong).
export function createState() {
  return {
    template: null,
    settings: null,
    photos: [],
    transforms: [],
    filter: 'normal',
    facingRequested: 'user',
    logged: false,
  };
}

// Melepas memori canvas lebih cepat daripada menunggu GC (penting di ponsel).
export function releaseCanvas(c) {
  if (c) {
    c.width = 0;
    c.height = 0;
  }
}

const defaultTransforms = (n) => Array.from({ length: n }, () => ({ ...DEFAULT_TRANSFORM }));

export function wouldDrop(state, template) {
  return state.photos.slice(template.slots.length).filter(Boolean).length;
}

// Foto dipertahankan sesuai urutan; kelebihan dilepas. Konfirmasi ke pengguna dilakukan pemanggil.
export function changeTemplate(state, template) {
  const n = template.slots.length;
  const extra = state.photos.slice(n);
  const dropped = extra.filter(Boolean).length;
  extra.forEach(releaseCanvas);
  state.photos = state.photos.slice(0, n);
  state.template = template;
  state.transforms = defaultTransforms(n);
  state.logged = false;
  return { dropped };
}

export function nextEmptySlot(state) {
  if (!state.template) return -1;
  for (let i = 0; i < state.template.slots.length; i++) if (!state.photos[i]) return i;
  return -1;
}

export function resetPhotos(state) {
  state.photos.forEach(releaseCanvas);
  state.photos = [];
  state.transforms = defaultTransforms(state.template?.slots.length ?? 0);
  state.logged = false;
}

export function resetAll(state) {
  resetPhotos(state);
  state.template = null;
  state.transforms = [];
  state.filter = 'normal';
}
