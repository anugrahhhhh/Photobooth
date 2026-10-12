import { getJSON, sendJSON } from './api.js';
import * as camera from './camera.js';
import { cameraErrorMessage, isFrontCamera, createRestartPolicy } from './camera.js';
import { FILTERS, filteredCanvas } from './filters.js';
import { clampTransform, clientToTemplate, fitWithin, hitSlot, previewScale, MIN_ZOOM, MAX_ZOOM } from './geometry.js';
import { createState, changeTemplate, wouldDrop, nextEmptySlot, resetPhotos, resetAll, releaseCanvas, latestOnly } from './state.js';
import { render, loadTemplateImage } from './strip.js';

const MAX_PHOTO_SIDE = 1920;
const PREVIEW_FILTER_SIDE = 1024;
const NEXT_SHOT_DELAY_MS = 800;
const DEFAULT_SETTINGS = { countdown_seconds: 3, mirror_output: 0 };
const IN_APP_UA = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter/i;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = createState();
let templateImg = null;
let screen = 'home';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/* ---------- Layar ---------- */

const STEPS = ['pick', 'booth', 'adjust', 'result'];

function show(next) {
  if (screen === 'booth' && next !== 'booth') leaveBooth();
  if (screen === 'pick' && next !== 'pick') picking.cancel();
  screen = next;
  for (const s of $$('.screen')) s.hidden = s.id !== `screen-${next}`;
  const idx = STEPS.indexOf(next);
  $('#progress').classList.toggle('idle', idx < 0);
  $$('#progress li').forEach((li, i) => {
    li.classList.toggle('current', i === idx);
    li.classList.toggle('done', i < idx);
  });
  scrollTo(0, 0);
  if (next === 'booth') enterBooth();
  if (next === 'adjust') enterAdjust();
  if (next === 'result') enterResult();
}

/* ---------- Beranda ---------- */

function initHome() {
  $('#start').addEventListener('click', () => openPicker('start'));
  if (IN_APP_UA.test(navigator.userAgent)) {
    const link = $('#inapp-link');
    link.value = location.href;
    $('#inapp-banner').hidden = false;
    $('#inapp-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        $('#inapp-copy').textContent = 'Tersalin';
      } catch {
        link.focus();
        link.select();
      }
    });
    $('#inapp-close').addEventListener('click', () => {
      $('#inapp-banner').hidden = true;
    });
  }
}

/* ---------- Pilih template ---------- */

let pickMode = 'start';
const picking = latestOnly();

function setGridBusy(busy) {
  for (const card of $$('.template-card')) card.disabled = busy;
}

function openPicker(mode) {
  pickMode = mode;
  $('#pick-title').textContent = mode === 'change' ? 'Ganti template' : 'Pilih template';
  $('#pick-back').hidden = mode !== 'change';
  show('pick');
  loadTemplates();
}

async function loadTemplates() {
  const status = $('#pick-status');
  const grid = $('#template-grid');
  $('#pick-retry').hidden = true;
  status.className = 'status-msg';
  status.textContent = 'Memuat template…';
  grid.replaceChildren();
  try {
    const [templates, settings] = await Promise.all([
      getJSON('/api/templates'),
      getJSON('/api/settings').catch(() => DEFAULT_SETTINGS),
    ]);
    state.settings = settings;
    status.textContent = templates.length ? '' : 'Belum ada template aktif. Hubungi petugas booth.';
    grid.replaceChildren(
      ...templates.map((t) => {
        const card = el(
          'button',
          { type: 'button', className: 'template-card card' },
          el('img', { src: t.thumb_url, alt: '', loading: 'lazy' }),
          el('span', {}, t.name),
          el('small', {}, `${t.slots.length} foto`),
        );
        card.addEventListener('click', () => pickTemplate(t));
        return card;
      }),
    );
  } catch (err) {
    status.textContent = `Daftar template gagal dimuat. ${err.message}`;
    status.className = 'status-msg error';
    $('#pick-retry').hidden = false;
  }
}

async function pickTemplate(t) {
  if (picking.pending()) return; // satu template dimuat dalam satu waktu
  const token = picking.begin();
  const status = $('#pick-status');
  status.className = 'status-msg';
  status.textContent = `Memuat "${t.name}"…`;
  setGridBusy(true);
  try {
    const img = await loadTemplateImage(t.image_url);
    if (!picking.isCurrent(token) || screen !== 'pick') return; // sudah ditinggalkan
    status.textContent = '';
    if (pickMode === 'change') {
      const n = wouldDrop(state, t);
      if (n > 0 && !confirm(`Template ini hanya punya ${t.slots.length} slot. ${n} foto terakhir akan dibuang. Lanjutkan?`)) return;
    } else {
      resetAll(state);
    }
    templateImg = img;
    changeTemplate(state, t);
    trimFilteredCache();
    invalidateResult();
    boothTarget = null;
    show(nextEmptySlot(state) >= 0 ? 'booth' : 'adjust');
  } catch (err) {
    if (!picking.isCurrent(token)) return;
    status.textContent = err.message;
    status.className = 'status-msg error';
  } finally {
    picking.done(token);
    setGridBusy(false);
  }
}

/* ---------- Booth ---------- */

let boothTarget = null; // null = isi slot kosong berurutan; angka = ulang satu slot
let cameraInfo = null;
let cameraWanted = false;
let wakeLock = null;
let runToken = null;
const restartPolicy = createRestartPolicy(3);

const currentSlot = () => (boothTarget ?? nextEmptySlot(state));

function updateBoothView() {
  const slot = currentSlot();
  const slots = state.template.slots;
  if (slot >= 0) {
    const s = slots[slot];
    $('#viewfinder').style.setProperty('--ratio', String(s.w / s.h));
    $('#slot-label').textContent =
      boothTarget != null ? `Ulang foto ${slot + 1} dari ${slots.length}` : `Foto ${slot + 1} dari ${slots.length}`;
  }
  $('#booth-to-adjust').hidden = nextEmptySlot(state) >= 0;
  $('#viewfinder').classList.toggle('mirror', Boolean(cameraInfo) && frontCamera());
}

function frontCamera() {
  return isFrontCamera({
    facingRequested: state.facingRequested,
    reportedFacing: cameraInfo?.reportedFacing,
    pickedByDeviceId: cameraInfo?.pickedByDeviceId,
    isTouch: IS_TOUCH,
  });
}

function enterBooth() {
  $('#gallery-errors').replaceChildren();
  setRunning(false);
  updateBoothView();
  requestWakeLock();
  cameraWanted = true;
  if (!camera.isLive()) startCamera();
}

function leaveBooth() {
  cancelRun();
  releaseWakeLock();
}

function showCameraError(message) {
  $('#camera-error-msg').textContent = message;
  $('#camera-error').hidden = false;
  $('#shoot').disabled = true;
}

function setCameraSwitching(busy) {
  $('#flip').disabled = busy;
  $('#camera-select').disabled = busy;
}

async function startCamera(pref) {
  $('#camera-error').hidden = true;
  $('#shoot').disabled = true;
  setCameraSwitching(true);
  const saved = camera.savedCameraId();
  const usePref = pref ?? (saved ? { deviceId: saved } : { facingMode: state.facingRequested });
  try {
    const info = await camera.start($('#video'), usePref);
    if (!info) return; // tersusul oleh start lain; yang terbaru yang mengurus tampilan
    setCameraSwitching(false);
    cameraInfo = { ...info, pickedByDeviceId: Boolean(usePref.deviceId) && !info.usedFallback };
    restartPolicy.success();
    $('#shoot').disabled = false;
    updateBoothView();
    await refreshCameraList();
  } catch (err) {
    setCameraSwitching(false);
    cameraInfo = null;
    showCameraError(cameraErrorMessage(err));
  }
}

async function refreshCameraList() {
  const cams = await camera.listCameras().catch(() => []);
  const select = $('#camera-select');
  const multiple = cams.length > 1;
  $('#flip').hidden = !multiple || !IS_TOUCH;
  select.hidden = !multiple;
  select.replaceChildren(...cams.map((c) => el('option', { value: c.deviceId, textContent: c.label })));
  if (cameraInfo?.deviceId) select.value = cameraInfo.deviceId;
}

camera.onStreamLost(() => recoverCamera());

function recoverCamera() {
  if (screen !== 'booth' || !cameraWanted) return;
  if (restartPolicy.shouldRetry()) startCamera();
  else showCameraError('Kamera terputus dan gagal dinyalakan ulang. Periksa kamera lalu tekan Coba lagi.');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || screen !== 'booth') return;
  requestWakeLock();
  if (cameraWanted && !camera.isLive()) recoverCamera();
});

addEventListener('pagehide', () => camera.stop());

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function setRunning(running) {
  $('#shoot').hidden = running;
  $('#cancel').hidden = !running;
  for (const b of $$('.booth-tools button, .booth-tools select, .booth-tools .gallery-input')) b.disabled = running;
}

function cancelRun() {
  if (runToken) runToken.cancelled = true;
  runToken = null;
  $('#countdown').hidden = true;
  setRunning(false);
}

async function countdown(seconds, token) {
  const node = $('#countdown');
  node.hidden = false;
  for (let s = seconds; s > 0; s--) {
    node.textContent = String(s);
    await sleep(1000);
    if (token.cancelled) return false;
  }
  node.hidden = true;
  return true;
}

function flash() {
  const f = $('#flash');
  f.classList.remove('on');
  void f.offsetWidth; // mulai ulang animasi
  f.classList.add('on');
}

async function runSequence() {
  const token = { cancelled: false };
  runToken = token;
  setRunning(true);
  const seconds = state.settings?.countdown_seconds ?? DEFAULT_SETTINGS.countdown_seconds;
  while (!token.cancelled) {
    const slot = currentSlot();
    if (slot < 0) break;
    updateBoothView();
    if (!(await countdown(seconds, token))) return;
    if (!camera.isLive()) {
      cancelRun();
      return recoverCamera();
    }
    flash();
    const mirror = (state.settings?.mirror_output ?? 0) === 1 && frontCamera();
    setPhoto(slot, camera.capture($('#video'), MAX_PHOTO_SIDE, { mirror }));
    if (boothTarget != null) break;
    if (nextEmptySlot(state) >= 0) await sleep(NEXT_SHOT_DELAY_MS);
  }
  if (token.cancelled) return;
  runToken = null;
  setRunning(false);
  boothTarget = null;
  show('adjust');
}

function setPhoto(slot, canvas) {
  releaseCanvas(state.photos[slot]);
  state.photos[slot] = canvas;
  releaseCanvas(filteredCache[slot]);
  filteredCache[slot] = null;
  invalidateResult();
}

function initBooth() {
  $('#shoot').addEventListener('click', runSequence);
  $('#cancel').addEventListener('click', cancelRun);
  $('#camera-retry').addEventListener('click', () => {
    restartPolicy.success();
    startCamera();
  });
  $('#flip').addEventListener('click', async () => {
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
  $('#booth-to-adjust').addEventListener('click', () => {
    boothTarget = null;
    show('adjust');
  });
  for (const input of $$('.gallery-input')) {
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      await addFromGallery(files);
    });
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
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
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
    ctx.drawImage(bitmap ?? img, 0, 0, w, h);
    bitmap?.close();
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addFromGallery(files) {
  const errors = [];
  for (const file of files) {
    const slot = currentSlot();
    if (slot < 0) break;
    try {
      setPhoto(slot, await decodeImage(file));
      if (boothTarget != null) {
        boothTarget = null;
        break;
      }
    } catch {
      errors.push(el('li', { className: 'error' }, `${file.name} tidak bisa dibuka (format seperti HEIC mungkin tidak didukung).`));
    }
  }
  $('#gallery-errors').replaceChildren(...errors);
  if (errors.length) {
    updateBoothView();
    return;
  }
  if (boothTarget == null && nextEmptySlot(state) < 0) show('adjust');
  else updateBoothView();
}

/* ---------- Atur ---------- */

let filteredCache = []; // salinan 1024 px per foto untuk filter aktif
let selected = 0;
let previewScaleValue = 1;
let frame = 0;

function trimFilteredCache() {
  filteredCache.slice(state.template.slots.length).forEach(releaseCanvas);
  filteredCache = filteredCache.slice(0, state.template.slots.length);
}

function clearFilteredCache() {
  filteredCache.forEach(releaseCanvas);
  filteredCache = [];
}

function ensureFiltered() {
  if (state.filter === 'normal') return;
  state.photos.forEach((p, i) => {
    if (p && !filteredCache[i]) filteredCache[i] = filteredCanvas(p, state.filter, PREVIEW_FILTER_SIDE);
  });
}

function scheduleAdjustRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(drawAdjust);
}

function drawAdjust() {
  if (screen !== 'adjust' || !state.template) return;
  const canvas = $('#adjust-canvas');
  const stage = $('#adjust-stage');
  const t = state.template;
  const dpr = devicePixelRatio || 1;
  const boxH = Math.max(240, innerHeight - stage.getBoundingClientRect().top - (innerWidth < 800 ? 260 : 40));
  previewScaleValue = previewScale(t.canvas_w, t.canvas_h, stage.clientWidth, boxH, dpr);
  ensureFiltered();
  render(canvas, {
    template: t,
    img: templateImg,
    photos: state.photos,
    transforms: state.transforms,
    filtered: state.filter === 'normal' ? [] : filteredCache,
    scale: previewScaleValue,
  });
  canvas.style.width = `${canvas.width / Math.min(dpr, 2)}px`;
  const s = t.slots[selected];
  if (s) {
    const ctx = canvas.getContext('2d');
    const k = previewScaleValue;
    ctx.lineWidth = 3 * Math.min(dpr, 2);
    ctx.strokeStyle = '#d6336c';
    ctx.strokeRect(s.x * k, s.y * k, s.w * k, s.h * k);
  }
  const tr = state.transforms[selected];
  if (tr) $('#zoom').value = String(tr.zoom);
  $('#retake').disabled = !s;
}

function updateTransform(i, next) {
  const photo = state.photos[i];
  const slot = state.template.slots[i];
  if (!photo || !slot) return;
  state.transforms[i] = clampTransform(next, photo.width, photo.height, slot);
  invalidateResult();
  scheduleAdjustRender();
}

function setZoom(z) {
  const tr = state.transforms[selected];
  if (tr) updateTransform(selected, { ...tr, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) });
}

function enterAdjust() {
  if (!state.template.slots[selected]) selected = 0;
  renderFilterButtons();
  scheduleAdjustRender();
}

function renderFilterButtons() {
  $('#filters').replaceChildren(
    ...FILTERS.map((f) => {
      const b = el('button', { type: 'button', className: 'small', textContent: f.label });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(f.id === state.filter));
      b.addEventListener('click', () => {
        if (state.filter === f.id) return;
        state.filter = f.id;
        clearFilteredCache();
        invalidateResult();
        renderFilterButtons();
        scheduleAdjustRender();
      });
      return b;
    }),
  );
}

function initAdjust() {
  const canvas = $('#adjust-canvas');
  const pointers = new Map();
  let gesture = null;

  const toTemplate = (e) =>
    clientToTemplate(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height, previewScaleValue);
  // Selisih piksel layar → satuan template.
  const pxToTemplate = () => canvas.width / canvas.getBoundingClientRect().width / previewScaleValue;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const hit = hitSlot(state.template.slots, toTemplate(e));
      if (hit >= 0 && hit !== selected) {
        selected = hit;
        scheduleAdjustRender();
      }
      gesture = hit >= 0 ? { type: 'pan', start: { x: e.clientX, y: e.clientY }, from: { ...state.transforms[selected] } } : null;
    } else if (pointers.size === 2 && state.transforms[selected]) {
      gesture = { type: 'pinch', dist: pinchDistance(), from: { ...state.transforms[selected] } };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    const slot = state.template.slots[selected];
    if (gesture.type === 'pan' && pointers.size === 1) {
      const k = pxToTemplate();
      updateTransform(selected, {
        ...gesture.from,
        panX: gesture.from.panX + ((e.clientX - gesture.start.x) * k) / slot.w,
        panY: gesture.from.panY + ((e.clientY - gesture.start.y) * k) / slot.h,
      });
    } else if (gesture.type === 'pinch' && pointers.size === 2 && gesture.dist > 0) {
      updateTransform(selected, { ...gesture.from, zoom: gesture.from.zoom * (pinchDistance() / gesture.dist) });
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1 && state.transforms[selected]) {
      // Dari cubit kembali ke geser dengan jari yang tersisa.
      const [p] = pointers.values();
      gesture = { type: 'pan', start: { ...p }, from: { ...state.transforms[selected] } };
    } else if (pointers.size === 0) {
      gesture = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener(
    'wheel',
    (e) => {
      const tr = state.transforms[selected];
      if (!tr) return;
      e.preventDefault();
      setZoom(tr.zoom * Math.exp(-e.deltaY * 0.001));
    },
    { passive: false },
  );

  $('#zoom').addEventListener('input', (e) => setZoom(Number(e.target.value)));
  $('#zoom-in').addEventListener('click', () => setZoom((state.transforms[selected]?.zoom ?? 1) + 0.1));
  $('#zoom-out').addEventListener('click', () => setZoom((state.transforms[selected]?.zoom ?? 1) - 0.1));
  $('#retake').addEventListener('click', () => {
    boothTarget = selected;
    show('booth');
  });
  $('#change-template').addEventListener('click', () => openPicker('change'));
  $('#pick-back').addEventListener('click', () => show('adjust'));
  $('#pick-retry').addEventListener('click', loadTemplates);
  $('#to-result').addEventListener('click', () => show('result'));
  addEventListener('resize', () => screen === 'adjust' && scheduleAdjustRender());
}

/* ---------- Hasil dan unduh ---------- */

let result = null; // { file, url } hasil akhir yang sudah disiapkan
let preparing = 0;

function invalidateResult() {
  if (result) URL.revokeObjectURL(result.url);
  result = null;
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function prepareResult() {
  const job = ++preparing;
  const t = state.template;
  const canvas = el('canvas');
  // Salinan tersaring resolusi penuh dibuat dan dilepas satu per slot (null untuk Normal).
  render(canvas, {
    template: t,
    img: templateImg,
    photos: state.photos,
    transforms: state.transforms,
    scale: 1,
    mapPhoto: (p) => filteredCanvas(p, state.filter),
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  releaseCanvas(canvas);
  if (job !== preparing) return; // sudah ada permintaan lebih baru
  if (!blob) throw new Error('Gagal menyiapkan gambar');
  const file = new File([blob], `photobooth-${timestamp()}.jpg`, { type: 'image/jpeg' });
  result = { file, url: URL.createObjectURL(file) };
}

async function enterResult() {
  const btn = $('#download');
  const status = $('#result-status');
  status.textContent = '';
  if (!result) {
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';
    $('#result-img').removeAttribute('src');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // biarkan tombol tergambar dulu
    try {
      await prepareResult();
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-msg error';
      return;
    }
  }
  if (!result || screen !== 'result') return;
  $('#result-img').src = result.url;
  btn.disabled = false;
  btn.textContent = 'Unduh';
}

function logSession() {
  if (state.logged || !state.template) return;
  sendJSON('POST', '/api/sessions', { template_id: state.template.id })
    .then(() => {
      state.logged = true;
    })
    .catch(() => {});
}

async function download() {
  if (!result) return;
  const { file } = result;
  logSession();

  if (IS_TOUCH && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      // share gagal (misal izin): lanjut ke unduhan biasa
    }
  }

  const url = URL.createObjectURL(file);
  if ('download' in HTMLAnchorElement.prototype) {
    const a = el('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  // iOS lama: tampilkan gambar untuk ditekan lama.
  $('#save-overlay-img').src = url;
  $('#save-overlay').hidden = false;
  $('#save-overlay-close').onclick = () => {
    $('#save-overlay').hidden = true;
    $('#save-overlay-img').removeAttribute('src');
    URL.revokeObjectURL(url);
  };
}

function initResult() {
  $('#download').addEventListener('click', download);
  $('#back-to-adjust').addEventListener('click', () => show('adjust'));
  $('#restart').addEventListener('click', () => {
    resetPhotos(state);
    clearFilteredCache();
    invalidateResult();
    boothTarget = null;
    selected = 0;
    show('booth');
  });
  $('#new-session').addEventListener('click', () => {
    resetAll(state);
    clearFilteredCache();
    invalidateResult();
    templateImg = null;
    boothTarget = null;
    selected = 0;
    openPicker('start');
  });
}

initHome();
initBooth();
initAdjust();
initResult();
show('home');
