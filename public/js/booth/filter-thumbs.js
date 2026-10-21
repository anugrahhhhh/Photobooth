import { filteredCanvas } from '../filters.js';
import { fitWithin } from '../geometry.js';
import { releaseCanvas } from '../state.js';

const THUMB_SIDE = 96;

// filteredCanvas mengembalikan null untuk Normal, jadi Normal diperkecil di sini.
function makeThumb(photo, id) {
  const filtered = filteredCanvas(photo, id, THUMB_SIDE);
  if (filtered) return filtered;
  const { w, h } = fitWithin(photo.width, photo.height, THUMB_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c2d = canvas.getContext('2d');
  c2d.imageSmoothingQuality = 'high';
  c2d.drawImage(photo, 0, 0, w, h);
  return canvas;
}

export function createFilterThumbs({ make = makeThumb, release = releaseCanvas } = {}) {
  const cache = new Map(); // foto → Map(filterId → canvas)

  return {
    get(photo, filterId) {
      let byFilter = cache.get(photo);
      if (!byFilter) cache.set(photo, (byFilter = new Map()));
      if (!byFilter.has(filterId)) byFilter.set(filterId, make(photo, filterId));
      return byFilter.get(filterId);
    },
    drop(photo) {
      cache.get(photo)?.forEach(release);
      cache.delete(photo);
    },
    clear() {
      cache.forEach((byFilter) => byFilter.forEach(release));
      cache.clear();
    },
  };
}
