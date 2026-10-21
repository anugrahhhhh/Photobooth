import { $ } from '../dom.js';
import { fitWithin } from '../../geometry.js';
import { overlayLayout, applyOverlay } from '../overlay.js';
import { createReviewTimer } from '../review-timer.js';
import { nextEmptySlot, releaseCanvas } from '../../state.js';

const MAX_REVIEW_SIDE = 1024;

let ctxRef = null;
let timer = null;
let raf = 0;
let slotNow = -1;
let targetNow = null;

function stop() {
  timer?.cancel();
  timer = null;
  cancelAnimationFrame(raf);
  raf = 0;
}

function advance() {
  stop();
  const ctx = ctxRef;
  if (targetNow != null || nextEmptySlot(ctx.state) < 0) {
    ctx.session.target = null;
    ctx.go('adjust');
  } else {
    ctx.go('shoot', { auto: true });
  }
}

function retake() {
  stop();
  ctxRef.go('shoot', { target: slotNow, auto: true });
}

function frame() {
  if (!timer) return;
  const status = timer.tick();
  $('#review-bar').style.transform = `scaleX(${timer.fraction()})`;
  if (status === 'expired') return advance();
  if (status === 'running') raf = requestAnimationFrame(frame);
}

export function init(ctx) {
  ctxRef = ctx;
  $('#review-next').addEventListener('click', advance);
  $('#review-retake').addEventListener('click', retake);
}

export function enter(ctx, { slot = 0, target = null } = {}) {
  ctx.idle?.pause();
  slotNow = slot;
  targetNow = target;
  const { state } = ctx;
  const src = state.photos[slot];
  const canvas = $('#review-photo');
  if (src && src.width) {
    // Salinan kecil untuk tampilan; canvas state tidak pernah masuk DOM.
    const { w, h } = fitWithin(src.width, src.height, MAX_REVIEW_SIDE);
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  }
  applyOverlay($('#review-frame'), overlayLayout(state.template, slot), state.template);
  const seconds = Number(ctx.settings.review_seconds ?? 3);
  stop();
  timer = createReviewTimer({ durationMs: Math.max(1, seconds * 1000) });
  frame();
}

export function leave(ctx) {
  stop();
  releaseCanvas($('#review-photo'));
  ctx.idle?.resume();
}
