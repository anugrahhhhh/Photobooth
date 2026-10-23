import { $, $$, el, sleep } from '../dom.js';
import { t, onLangChange } from '../../i18n.js';
import * as camera from '../../camera.js';
import { cameraErrorMessage, isFrontCamera, createRestartPolicy } from '../../camera.js';
import { fitWithin } from '../../geometry.js';
import { overlayLayout, applyOverlay } from '../overlay.js';
import { nextEmptySlot, releaseCanvas } from '../../state.js';
import { beep, shutter } from '../../sound.js';
import { shouldReview } from '../review-timer.js';
import { initialMirror } from '../mirror.js';
import { KEYS, read, write } from '../../storage.js';
import { canRecord, createSessionRecorder, finishSessionRecording } from '../../media/recorder.js';

export const MAX_PHOTO_SIDE = 1920;
export const NEXT_SHOT_DELAY_MS = 800;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

let ctxRef = null;
let cameraInfo = null;
let cameraWanted = false;
let cameraReady = false;
let autoPending = false;
let runToken = null;
let importing = false;
let mirrorOn = false;
const restartPolicy = createRestartPolicy(3);

const currentSlot = () => ctxRef.session.target ?? nextEmptySlot(ctxRef.state);
const onShoot = () => ctxRef?.screen() === 'shoot';

// Menyimpan foto ke slot: hook dijalankan dengan canvas lama, baru canvas lama dilepas.
export function setPhoto(ctx, slot, canvas) {
  const old = ctx.state.photos[slot];
  ctx.notifyPhotoChanged(slot, old);
  releaseCanvas(old);
  ctx.state.photos[slot] = canvas;
  ctx.result.invalidate();
}

function frontCamera() {
  return isFrontCamera({
    facingRequested: ctxRef.state.facingRequested,
    reportedFacing: cameraInfo?.reportedFacing,
    pickedByDeviceId: cameraInfo?.pickedByDeviceId,
    isTouch: IS_TOUCH,
  });
}

export function isMirrored() {
  return mirrorOn;
}

// Dihitung ulang tiap kamera berganti; untuk kamera belakang tombol disembunyikan.
function syncMirror() {
  const front = Boolean(cameraInfo) && frontCamera();
  mirrorOn = initialMirror({
    front,
    stored: read(KEYS.mirror),
    settingDefault: ctxRef.settings?.mirror_default ?? 1,
  });
  $('#mirror-toggle').hidden = !front;
}

function renderMirrorView() {
  $('#video').classList.toggle('mirror', mirrorOn);
  $('#mirror-toggle').setAttribute('aria-pressed', String(mirrorOn));
}

function renderSlotLabel() {
  const { state, session } = ctxRef;
  const slot = currentSlot();
  if (!state.template || slot < 0) return;
  $('#slot-label').textContent = t(session.target != null ? 'booth.shoot.retakeOf' : 'booth.shoot.photoOf', {
    i: slot + 1,
    n: state.template.slots.length,
  });
}

function updateView() {
  const { state, session } = ctxRef;
  const slots = state.template.slots;
  const slot = currentSlot();
  if (slot >= 0) {
    applyOverlay($('#viewfinder'), overlayLayout(state.template, slot), state.template);
    renderSlotLabel();
  }
  $('#shoot-dots').replaceChildren(
    ...slots.map((_, i) => {
      const cls = i === slot ? 'current' : state.photos[i] ? 'done' : '';
      return el('li', { className: `shoot-dot ${cls}`.trim() });
    }),
  );
  renderMirrorView();
  syncControls();
}

// Status tombol dihitung di satu tempat dari: sedang jalan, sedang impor, kamera siap.
function syncControls() {
  const running = Boolean(runToken);
  const locked = running || importing;
  $('#shoot').hidden = running;
  $('#cancel').hidden = !running;
  $('#shoot').disabled = importing || !cameraReady;
  for (const c of $$('.shoot-tools button, .shoot-tools select, .gallery-input')) c.disabled = locked;
  $('#shoot-to-adjust').hidden = nextEmptySlot(ctxRef.state) >= 0;
  $('#rec-badge').hidden = !ctxRef.recorder?.active();
}

function showCameraError(key) {
  cameraReady = false;
  const msg = $('#camera-error-msg');
  msg.dataset.i18n = key; // ikut berganti saat bahasa diubah
  msg.textContent = t(key);
  $('#camera-error').hidden = false;
  syncControls();
}

function setCameraSwitching(busy) {
  $('#flip').disabled = busy;
  $('#camera-select').disabled = busy;
}

async function startCamera(pref) {
  const { state } = ctxRef;
  $('#camera-error').hidden = true;
  cameraReady = false;
  syncControls();
  setCameraSwitching(true);
  const saved = camera.savedCameraId();
  const usePref = pref ?? (saved ? { deviceId: saved } : { facingMode: state.facingRequested });
  try {
    const info = await camera.start($('#video'), usePref);
    if (!info) return; // tersusul oleh start lain; yang terbaru yang mengurus tampilan
    setCameraSwitching(false);
    cameraInfo = { ...info, pickedByDeviceId: Boolean(usePref.deviceId) && !info.usedFallback };
    restartPolicy.success();
    cameraReady = true;
    syncMirror();
    if (onShoot()) updateView();
    await refreshCameraList();
    if (onShoot() && autoPending) {
      autoPending = false;
      runSequence();
    }
  } catch (err) {
    setCameraSwitching(false);
    cameraInfo = null;
    syncMirror();
    autoPending = false;
    showCameraError(cameraErrorMessage(err));
  }
}

async function refreshCameraList() {
  const cams = await camera.listCameras().catch(() => []);
  const select = $('#camera-select');
  const multiple = cams.length > 1;
  $('#flip').hidden = !multiple || !IS_TOUCH;
  select.hidden = !multiple;
  select.replaceChildren(
    ...cams.map((c, i) => el('option', { value: c.deviceId, textContent: c.label || t('booth.shoot.cameraN', { n: i + 1 }) })),
  );
  if (cameraInfo?.deviceId) select.value = cameraInfo.deviceId;
}

function recoverCamera() {
  if (!onShoot() || !cameraWanted) return;
  if (restartPolicy.shouldRetry()) startCamera();
  else showCameraError('booth.shoot.cameraLost');
}

// Rekaman sesi dibuang bila urutan terhenti di tengah; urutan baru memulai klip baru.
function discardRecorder() {
  ctxRef.recorder?.discard();
  ctxRef.recorder = null;
  ctxRef.session.videoTried = false;
}

function cancelRun() {
  if (runToken) {
    runToken.cancelled = true;
    discardRecorder();
  }
  runToken = null;
  $('#countdown').hidden = true;
  if (ctxRef.state.template) syncControls();
}

async function countdown(seconds, token) {
  const node = $('#countdown');
  node.hidden = false;
  for (let s = seconds; s > 0; s--) {
    node.textContent = String(s);
    ctxRef.recorder?.setOverlay({ count: s });
    beep(s === 1);
    await sleep(1000);
    if (token.cancelled) return false;
  }
  ctxRef.recorder?.setOverlay({ count: null });
  node.hidden = true;
  return true;
}

function flash() {
  const f = $('#flash');
  f.classList.remove('on');
  void f.offsetWidth; // mulai ulang animasi
  f.classList.add('on');
}

// Klip dimulai di urutan pertama sesi; urutan lanjutan (setelah review) hanya melanjutkan.
// Ulang foto dari layar Atur tidak merekam lagi: klip sesi dipertahankan.
function startRecording(ctx) {
  if (ctx.recorder) return ctx.recorder.resume();
  const { session } = ctx;
  if (session.video || session.videoTried || Number(ctx.settings.video_enabled) !== 1 || !canRecord()) return;
  session.videoTried = true;
  try {
    ctx.recorder = createSessionRecorder({
      video: $('#video'),
      mirror: isMirrored,
      onStateChange: () => ($('#rec-badge').hidden = !ctx.recorder?.active()),
    });
    ctx.recorder.start();
  } catch {
    ctx.recorder = null; // video opsional: foto tetap jalan
  }
}

async function runSequence() {
  const ctx = ctxRef;
  if (runToken || importing) return;
  const token = { cancelled: false };
  runToken = token;
  startRecording(ctx);
  syncControls();
  ctx.idle?.pause();
  let idleResumed = false;
  const resumeIdle = () => {
    if (idleResumed) return;
    idleResumed = true;
    ctx.idle?.resume();
  };
  try {
    while (!token.cancelled) {
      const slot = currentSlot();
      if (slot < 0) break;
      updateView();
      // Dibaca saat dipakai: pengaturan server menyusul setelah layar dipasang.
      if (!(await countdown(Number(ctx.settings.countdown_seconds ?? 3), token))) return;
      if (!camera.isLive()) {
        cancelRun();
        return recoverCamera();
      }
      flash();
      ctx.recorder?.setOverlay({ count: null, flash: true });
      shutter();
      setPhoto(ctx, slot, camera.capture($('#video'), MAX_PHOTO_SIDE, { mirror: isMirrored() }));
      if (shouldReview(ctx.settings.review_seconds, 'camera')) {
        const target = ctx.session.target;
        runToken = null;
        syncControls();
        resumeIdle(); // dilepas sebelum pindah: review.enter menjeda lagi
        ctx.go('review', { slot, target });
        return;
      }
      ctx.session.target = null; // setelah ulang, lanjut hanya bila masih ada slot kosong
      if (nextEmptySlot(ctx.state) >= 0) await sleep(NEXT_SHOT_DELAY_MS);
    }
    if (token.cancelled) return;
    runToken = null;
    syncControls();
    ctx.session.target = null;
    resumeIdle();
    finishSessionRecording(ctx);
    ctx.go('adjust');
  } finally {
    resumeIdle();
  }
}

/* ---------- Galeri ---------- */

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = url;
  });
}

// Dekode dengan orientasi EXIF, diperkecil ke sisi maksimal 1920. Tidak pernah dicermin.
async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_PHOTO_SIDE);
    const canvas = el('canvas', { width: w, height: h });
    const c2d = canvas.getContext('2d');
    c2d.imageSmoothingQuality = 'high';
    let bitmap = null;
    if ('createImageBitmap' in window) {
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: 'high',
        });
      } catch {
        bitmap = null; // opsi tidak didukung: pakai <img>
      }
    }
    c2d.drawImage(bitmap ?? img, 0, 0, w, h);
    bitmap?.close();
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addFromGallery(files) {
  const ctx = ctxRef;
  if (importing || runToken || !files.length) return;
  const visit = ctx.visit();
  const errors = [];
  importing = true;
  syncControls();
  try {
    for (const file of files) {
      const slot = currentSlot();
      if (slot < 0) break;
      try {
        const canvas = await decodeImage(file);
        if (ctx.visit() !== visit) {
          releaseCanvas(canvas); // layar sudah ditinggalkan selama dekode
          return;
        }
        setPhoto(ctx, slot, canvas);
        if (ctx.session.target != null) {
          ctx.session.target = null;
          break;
        }
      } catch {
        errors.push(el('li', {}, t('booth.shoot.galleryError', { name: file.name })));
      }
    }
  } finally {
    importing = false;
    if (onShoot() && ctx.state.template) syncControls();
  }
  if (ctx.visit() !== visit) return;
  $('#gallery-errors').replaceChildren(...errors);
  if (!errors.length && ctx.session.target == null && nextEmptySlot(ctx.state) < 0) ctx.go('adjust');
  else updateView();
}

/* ---------- Siklus layar ---------- */

export function init(ctx) {
  ctxRef = ctx;
  onLangChange(() => onShoot() && renderSlotLabel());
  $('#shoot').addEventListener('click', runSequence);
  $('#cancel').addEventListener('click', cancelRun);
  $('#camera-retry').addEventListener('click', () => {
    restartPolicy.success();
    startCamera();
  });
  $('#mirror-toggle').addEventListener('click', () => {
    mirrorOn = !mirrorOn;
    write(KEYS.mirror, mirrorOn ? '1' : '0');
    renderMirrorView();
  });
  $('#flip').addEventListener('click', async () => {
    const { state } = ctx;
    state.facingRequested = state.facingRequested === 'user' ? 'environment' : 'user';
    camera.saveCameraId(null);
    await startCamera({ facingMode: state.facingRequested });
  });
  $('#camera-select').addEventListener('change', async (e) => {
    camera.saveCameraId(e.target.value);
    await startCamera({ deviceId: e.target.value });
  });
  if (document.fullscreenEnabled) {
    const fs = $('#fullscreen');
    fs.hidden = false;
    fs.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    });
  }
  $('#shoot-to-adjust').addEventListener('click', () => {
    ctx.session.target = null;
    finishSessionRecording(ctx);
    ctx.go('adjust');
  });
  for (const input of $$('.gallery-input')) {
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      await addFromGallery(files);
    });
  }
  camera.onStreamLost(() => recoverCamera());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !onShoot()) return;
    if (!ctx.kiosk()) {
      // Sistem melepas wake lock saat tab tersembunyi, tetapi held() masih true: lepas dulu.
      // Di kiosk, main.js yang memegang wake lock.
      ctx.wakeLock.release();
      ctx.wakeLock.acquire();
    }
    if (cameraWanted && !camera.isLive()) recoverCamera();
  });
  addEventListener('pagehide', () => camera.stop());
}

export function enter(ctx, { target = null, auto = false } = {}) {
  ctx.session.target = target;
  $('#gallery-errors').replaceChildren();
  $('#countdown').hidden = true;
  ctx.wakeLock.acquire();
  cameraWanted = true;
  autoPending = auto;
  cameraReady = camera.isLive();
  updateView();
  if (!cameraReady) {
    startCamera();
  } else if (auto) {
    autoPending = false;
    runSequence();
  }
}

export function leave(ctx) {
  cancelRun();
  autoPending = false;
  if (!ctx.kiosk()) ctx.wakeLock.release();
}
