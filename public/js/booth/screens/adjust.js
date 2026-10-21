import { $, el } from '../dom.js';
import { t, onLangChange } from '../../i18n.js';
import { FILTERS, filteredCanvas } from '../../filters.js';
import { clampTransform, clientToTemplate, hitSlot, previewScale, MIN_ZOOM, MAX_ZOOM } from '../../geometry.js';
import { releaseCanvas } from '../../state.js';
import { render } from '../../strip.js';

const PREVIEW_FILTER_SIDE = 1024;

let ctxRef = null;
let filteredCache = []; // salinan 1024 px per foto untuk filter aktif
let previewScaleValue = 1;
let frame = 0;

const onAdjust = () => ctxRef?.screen() === 'adjust';

export function clearFilteredCache() {
  filteredCache.forEach(releaseCanvas);
  filteredCache = [];
}

function trimFilteredCache(count) {
  filteredCache.slice(count).forEach(releaseCanvas);
  filteredCache = filteredCache.slice(0, count);
}

function ensureFiltered(state) {
  if (state.filter === 'normal') return;
  state.photos.forEach((p, i) => {
    if (p && !filteredCache[i]) filteredCache[i] = filteredCanvas(p, state.filter, PREVIEW_FILTER_SIDE);
  });
}

function scheduleDraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => drawAdjust(ctxRef));
}

export function drawAdjust(ctx) {
  const { state, session } = ctx;
  if (!onAdjust() || !state.template) return;
  const canvas = $('#adjust-canvas');
  const stage = $('#adjust-stage');
  const tpl = state.template;
  const dpr = devicePixelRatio || 1;
  const boxH = Math.max(240, innerHeight - stage.getBoundingClientRect().top - (innerWidth < 800 ? 260 : 40));
  previewScaleValue = previewScale(tpl.canvas_w, tpl.canvas_h, stage.clientWidth, boxH, dpr);
  ensureFiltered(state);
  render(canvas, {
    template: tpl,
    img: session.templateImg,
    photos: state.photos,
    transforms: state.transforms,
    filtered: state.filter === 'normal' ? [] : filteredCache,
    scale: previewScaleValue,
  });
  canvas.style.width = `${canvas.width / Math.min(dpr, 2)}px`;
  const s = tpl.slots[session.selected];
  if (s) {
    const c2d = canvas.getContext('2d');
    const k = previewScaleValue;
    c2d.lineWidth = 3 * Math.min(dpr, 2);
    c2d.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d6336c';
    c2d.strokeRect(s.x * k, s.y * k, s.w * k, s.h * k);
  }
  const tr = state.transforms[session.selected];
  if (tr) $('#zoom').value = String(tr.zoom);
  $('#retake').disabled = !s;
}

function updateTransform(ctx, i, next) {
  const { state } = ctx;
  const photo = state.photos[i];
  const slot = state.template.slots[i];
  if (!photo || !slot) return;
  state.transforms[i] = clampTransform(next, photo.width, photo.height, slot);
  ctx.result.invalidate();
  scheduleDraw();
}

function setZoom(ctx, z) {
  const i = ctx.session.selected;
  const tr = ctx.state.transforms[i];
  if (tr) updateTransform(ctx, i, { ...tr, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) });
}

function renderFilterButtons() {
  const { state } = ctxRef;
  $('#filters').replaceChildren(
    ...FILTERS.map((f) => {
      const b = el('button', { type: 'button', className: 'chip', textContent: t(`filter.${f.id}`) });
      b.setAttribute('aria-pressed', String(f.id === state.filter));
      b.addEventListener('click', () => {
        if (state.filter === f.id) return;
        state.filter = f.id;
        clearFilteredCache();
        ctxRef.result.invalidate();
        renderFilterButtons();
        scheduleDraw();
      });
      return b;
    }),
  );
}

function initGestures(ctx) {
  const canvas = $('#adjust-canvas');
  const pointers = new Map();
  let gesture = null;
  const selected = () => ctx.session.selected;
  const transform = () => ctx.state.transforms[selected()];

  const toTemplate = (e) =>
    clientToTemplate(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height, previewScaleValue);
  // Selisih piksel layar → satuan template.
  const pxToTemplate = () => canvas.width / canvas.getBoundingClientRect().width / previewScaleValue;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!ctx.state.template) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const hit = hitSlot(ctx.state.template.slots, toTemplate(e));
      if (hit >= 0 && hit !== selected()) {
        ctx.session.selected = hit;
        scheduleDraw();
      }
      gesture = hit >= 0 ? { type: 'pan', start: { x: e.clientX, y: e.clientY }, from: { ...transform() } } : null;
    } else if (pointers.size === 2 && transform()) {
      gesture = { type: 'pinch', dist: pinchDistance(), from: { ...transform() } };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    const slot = ctx.state.template.slots[selected()];
    if (gesture.type === 'pan' && pointers.size === 1) {
      const k = pxToTemplate();
      updateTransform(ctx, selected(), {
        ...gesture.from,
        panX: gesture.from.panX + ((e.clientX - gesture.start.x) * k) / slot.w,
        panY: gesture.from.panY + ((e.clientY - gesture.start.y) * k) / slot.h,
      });
    } else if (gesture.type === 'pinch' && pointers.size === 2 && gesture.dist > 0) {
      updateTransform(ctx, selected(), { ...gesture.from, zoom: gesture.from.zoom * (pinchDistance() / gesture.dist) });
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1 && transform()) {
      // Dari cubit kembali ke geser dengan jari yang tersisa.
      const [p] = pointers.values();
      gesture = { type: 'pan', start: { ...p }, from: { ...transform() } };
    } else if (pointers.size === 0) {
      gesture = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener(
    'wheel',
    (e) => {
      const tr = transform();
      if (!tr) return;
      e.preventDefault();
      setZoom(ctx, tr.zoom * Math.exp(-e.deltaY * 0.001));
    },
    { passive: false },
  );
}

export function init(ctx) {
  ctxRef = ctx;
  initGestures(ctx);
  const zoomOf = () => ctx.state.transforms[ctx.session.selected]?.zoom ?? 1;
  $('#zoom').addEventListener('input', (e) => setZoom(ctx, Number(e.target.value)));
  $('#zoom-in').addEventListener('click', () => setZoom(ctx, zoomOf() + 0.1));
  $('#zoom-out').addEventListener('click', () => setZoom(ctx, zoomOf() - 0.1));
  $('#retake').addEventListener('click', () => ctx.go('shoot', { target: ctx.session.selected }));
  $('#change-template').addEventListener('click', () => ctx.go('pick', { mode: 'change' }));
  $('#to-result').addEventListener('click', () => ctx.go('result'));
  ctx.onPhotoChanged((slot) => {
    releaseCanvas(filteredCache[slot]);
    filteredCache[slot] = undefined;
  });
  ctx.onReset(clearFilteredCache);
  addEventListener('resize', () => onAdjust() && scheduleDraw());
  onLangChange(() => onAdjust() && renderFilterButtons());
}

export function enter(ctx) {
  ctx.result.invalidate(); // hasil yang sudah disiapkan batal begitu tamu kembali ke Atur
  trimFilteredCache(ctx.state.template.slots.length);
  if (!ctx.state.template.slots[ctx.session.selected]) ctx.session.selected = 0;
  renderFilterButtons();
  scheduleDraw();
}

export function leave() {
  cancelAnimationFrame(frame);
}
