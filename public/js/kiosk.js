// Mode kiosk: status per perangkat, pintu petugas (tekan lama), dialog PIN, dan menu petugas.
import { ApiError, sendJSON } from './api.js';
import { KEYS, read, write } from './storage.js';
import { t } from './i18n.js';
import { bindThemeToggle } from './theme.js';
import { isEnabled, setEnabled, unlock } from './sound.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 28;
const RING_LEN = 2 * Math.PI * RING_R;

/* ---------- Bagian murni (diuji di Node) ---------- */

export const isKioskOn = (store) => read(KEYS.kiosk, store) === '1';
export const setKioskOn = (on, store) => write(KEYS.kiosk, on ? '1' : null, store);

export function deviceLang(store) {
  const v = read(KEYS.kioskLang, store);
  return v === 'id' || v === 'en' ? v : null;
}
export const setDeviceLang = (lang, store) => write(KEYS.kioskLang, lang, store);

export function pinErrorKey(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) return { key: 'kiosk.pin.wrong' };
    if (err.status === 429) return { key: 'kiosk.pin.limited', params: { m: Math.ceil((err.retryAfter ?? 0) / 60) || 15 } };
    if (err.status === 0) return { key: 'kiosk.pin.offline' };
  }
  return { key: 'kiosk.pin.error' };
}

/* ---------- Bagian DOM ---------- */

const $ = (sel) => document.querySelector(sel);

let toastEl = null;
let toastTimer = 0;

// Toast kecil di bawah layar; action opsional { label, onClick }.
export function showToast(message, { action, ms = 4000 } = {}) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.replaceChildren(message);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      toastEl.hidden = true;
      action.onClick?.();
    });
    toastEl.append(' ', btn);
  }
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  if (toastEl) toastEl.hidden = true;
}

// Tekan lama: onProgress(0..1, event?) tiap frame, onDone sekali saat penuh; batal bila dilepas atau keluar.
export function bindLongPress(el, { ms = 3000, onProgress = () => {}, onDone = () => {} } = {}) {
  let raf = 0;
  let start = 0;
  let pressing = false;
  const stop = () => {
    if (!pressing) return;
    cancelAnimationFrame(raf);
    pressing = false;
    onProgress(0);
  };
  const tick = () => {
    const f = Math.min(1, (performance.now() - start) / ms);
    onProgress(f);
    if (f >= 1) {
      pressing = false;
      onDone();
    } else raf = requestAnimationFrame(tick);
  };
  el.addEventListener('pointerdown', (e) => {
    if (pressing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pressing = true;
    start = performance.now();
    onProgress(0, e);
    raf = requestAnimationFrame(tick);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(type, stop);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function createRing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'kiosk-ring');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('hidden', '');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '32');
  circle.setAttribute('cy', '32');
  circle.setAttribute('r', String(RING_R));
  circle.setAttribute('stroke-dasharray', String(RING_LEN));
  svg.append(circle);
  document.body.append(svg);
  return { svg, circle };
}

// Pintu petugas: cincin progres muncul di dekat titik tekan (sedikit di bawah jari).
function bindDoor(el, ring, onDone) {
  bindLongPress(el, {
    onProgress(f, e) {
      if (e) {
        ring.svg.style.left = `${Math.min(Math.max(e.clientX, 40), innerWidth - 40)}px`;
        ring.svg.style.top = `${Math.min(e.clientY + 56, innerHeight - 40)}px`;
      }
      ring.svg.toggleAttribute('hidden', f <= 0 || f >= 1);
      ring.circle.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - f)));
    },
    onDone,
  });
}

function createPinDialog(onVerified) {
  const dialog = $('#pin-dialog');
  const input = $('#pin-input');
  const error = $('#pin-error');
  const keypad = $('#pin-keypad');
  let busy = false;

  const key = (label, onClick, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${extra}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };
  const delBtn = key(t('kiosk.pin.delete'), () => del());
  const okBtn = key(t('kiosk.pin.ok'), () => submit(), 'btn-primary');
  delBtn.dataset.i18n = 'kiosk.pin.delete';
  okBtn.dataset.i18n = 'kiosk.pin.ok';

  const sync = () => (okBtn.disabled = busy || input.value.length < 4);
  const press = (digit) => {
    if (busy || input.value.length >= 8) return;
    input.value += digit;
    error.textContent = '';
    sync();
  };
  function del() {
    if (busy) return;
    input.value = input.value.slice(0, -1);
    sync();
  }
  async function submit() {
    if (busy || input.value.length < 4) return;
    busy = true;
    sync();
    try {
      await sendJSON('POST', '/api/kiosk/verify', { pin: input.value });
      dialog.close();
      onVerified();
    } catch (err) {
      const { key: k, params } = pinErrorKey(err);
      error.textContent = t(k, params);
      error.classList.add('error');
      input.value = '';
    } finally {
      busy = false;
      sync();
    }
  }

  for (const d of '123456789') keypad.append(key(d, () => press(d)));
  keypad.append(delBtn, key('0', () => press('0')), okBtn);

  $('#pin-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') del();
    else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  dialog.addEventListener('close', () => {
    input.value = '';
    error.textContent = '';
  });

  return {
    open() {
      input.value = '';
      error.textContent = '';
      sync();
      if (!dialog.open) dialog.showModal();
    },
  };
}

function createStaffMenu({ isOn, setOn, onSoundChange }) {
  const dialog = $('#staff-menu');
  const kioskBtn = $('#staff-kiosk');
  const soundBtn = $('#staff-sound');
  const langSel = $('#staff-lang');
  const fsBtn = $('#staff-fullscreen');

  const render = () => {
    kioskBtn.textContent = t(isOn() ? 'kiosk.menu.disable' : 'kiosk.menu.enable');
    soundBtn.textContent = t(isEnabled() ? 'kiosk.menu.sound.on' : 'kiosk.menu.sound.off');
    langSel.value = deviceLang() ?? '';
  };

  kioskBtn.addEventListener('click', () => {
    const next = !isOn();
    setOn(next);
    dialog.close();
    showToast(t(next ? 'kiosk.toast.on' : 'kiosk.toast.off'));
  });
  fsBtn.hidden = !document.fullscreenEnabled;
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  soundBtn.addEventListener('click', () => {
    unlock();
    setEnabled(!isEnabled());
    render();
    onSoundChange();
  });
  langSel.addEventListener('change', () => setDeviceLang(langSel.value || null));
  bindThemeToggle($('#staff-theme'), { label: (p) => t(`common.theme.${p}`) });
  $('#staff-reload').addEventListener('click', () => location.reload());
  $('#staff-close').addEventListener('click', () => dialog.close());

  return {
    open() {
      render();
      if (!dialog.open) dialog.showModal();
    },
  };
}

// Status kiosk satu-satunya ada di ctx (ctx.kiosk / ctx.setKioskOn); penguncian layar ada di main.js.
export function initKiosk(ctx, { onSoundChange = () => {} } = {}) {
  const corner = $('#kiosk-corner');
  const staffMenu = createStaffMenu({ isOn: ctx.kiosk, setOn: ctx.setKioskOn, onSoundChange });
  const pinDialog = createPinDialog(() => staffMenu.open());

  // kiosk_available dibaca saat tekan lama selesai: pengaturan server masuk belakangan.
  const openDoor = () => {
    if (ctx.settings.kiosk_available === false) showToast(t('kiosk.needPin'));
    else pinDialog.open();
  };
  const ring = createRing();
  bindDoor($('#booth-logo'), ring, openDoor);
  bindDoor(corner, ring, openDoor);
}
