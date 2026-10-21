// Bingkai template di sekitar kamera: hanya tampilan, tangkapan kamera tetap satu bingkai penuh.

// Pembulatan keluar dengan sedikit toleransi supaya galat floating point tidak menambah satu piksel.
const EPS = 1e-9;
const floorTol = (v) => Math.floor(v + EPS);
const ceilTol = (v) => Math.ceil(v - EPS);

export function overlayLayout(template, slotIndex, { margin = 0.18 } = {}) {
  const { canvas_w: cw, canvas_h: ch } = template;
  const s = template.slots[slotIndex];
  const pad = margin * Math.max(s.w, s.h);
  const x = Math.max(0, floorTol(s.x - pad));
  const y = Math.max(0, floorTol(s.y - pad));
  const right = Math.min(cw, ceilTol(s.x + s.w + pad));
  const bottom = Math.min(ch, ceilTol(s.y + s.h + pad));
  const w = right - x;
  const h = bottom - y;
  return {
    region: { x, y, w, h },
    slot: {
      left: ((s.x - x) / w) * 100,
      top: ((s.y - y) / h) * 100,
      width: (s.w / w) * 100,
      height: (s.h / h) * 100,
    },
    image: {
      left: (-x / w) * 100,
      top: (-y / h) * 100,
      width: (cw / w) * 100,
      height: (ch / h) * 100,
    },
  };
}

const setBox = (node, box) => {
  node.style.left = `${box.left}%`;
  node.style.top = `${box.top}%`;
  node.style.width = `${box.width}%`;
  node.style.height = `${box.height}%`;
};

// Mengatur wadah: rasio, latar, posisi .overlay-hole (video atau foto) dan gambar bingkai.
export function applyOverlay(container, layout, template) {
  const { region } = layout;
  container.style.aspectRatio = `${region.w} / ${region.h}`;
  container.style.setProperty('--ratio', String(region.w / region.h));
  container.style.background = template.bg_color;
  setBox(container.querySelector('.overlay-hole'), layout.slot);
  const frame = container.querySelector('.overlay-frame');
  setBox(frame, layout.image);
  if (frame.getAttribute('src') !== template.image_url) frame.src = template.image_url;
}
