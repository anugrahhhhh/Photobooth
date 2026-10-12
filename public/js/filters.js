import { fitWithin } from './geometry.js';

// Matriks 3×4 per kanal keluaran: [r, g, b, offset]. Hasil sama di semua browser,
// tidak bergantung pada ctx.filter (tidak ada di Safari lama).
const BW_ROW = [0.299, 0.587, 0.114, 0];

export const FILTERS = [
  { id: 'normal', label: 'Normal', matrix: null },
  { id: 'bw', label: 'Hitam putih', matrix: [BW_ROW, BW_ROW, BW_ROW] },
  {
    id: 'sepia',
    label: 'Sepia',
    matrix: [
      [0.393, 0.769, 0.189, 0],
      [0.349, 0.686, 0.168, 0],
      [0.272, 0.534, 0.131, 0],
    ],
  },
  {
    id: 'warm',
    label: 'Hangat',
    matrix: [
      [1.1, 0, 0, 10],
      [0, 1.02, 0, 5],
      [0, 0, 0.9, -10],
    ],
  },
  {
    id: 'cool',
    label: 'Dingin',
    matrix: [
      [0.9, 0, 0, -10],
      [0, 1, 0, 0],
      [0, 0, 1.1, 15],
    ],
  },
  {
    // Kontras 1,3 di sekitar abu tengah: offset = 128 × (1 − 1,3).
    id: 'contrast',
    label: 'Kontras',
    matrix: [
      [1.3, 0, 0, -38.4],
      [0, 1.3, 0, -38.4],
      [0, 0, 1.3, -38.4],
    ],
  },
];

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

// In place pada data RGBA; alpha tidak diubah. Uint8ClampedArray membulatkan dan membatasi 0–255.
export function applyMatrix(data, [r, g, b]) {
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    data[i] = r[0] * R + r[1] * G + r[2] * B + r[3];
    data[i + 1] = g[0] * R + g[1] * G + g[2] * B + g[3];
    data[i + 2] = b[0] * R + b[1] * G + b[2] * B + b[3];
  }
}

// Salinan tersaring (opsional diperkecil ke maxSide). null untuk Normal: pakai foto asli.
export function filteredCanvas(source, filterId, maxSide = Infinity) {
  const { matrix } = filterById(filterId);
  if (!matrix) return null;
  const { w, h } = fitWithin(source.width, source.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  applyMatrix(img.data, matrix);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
