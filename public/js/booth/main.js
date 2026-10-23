import { $, $$ } from './dom.js';
import { getJSON } from '../api.js';
import { PRODUCT_NAME } from '../brand.js';
import { KEYS, read } from '../storage.js';
import { initTheme, bindThemeToggle, refreshThemeToggles } from '../theme.js';
import { applyI18n, bindLangSelect, initialLang, onLangChange, setLang, t } from '../i18n.js';
import { createState, resetAll } from '../state.js';
import { initSound, isEnabled, setEnabled, unlock } from '../sound.js';
import { hideToast, initKiosk, isKioskOn, setKioskOn as persistKiosk, showToast } from '../kiosk.js';
import { attachIdle, createIdleTimer } from '../idle.js';
import { createWakeLock } from '../wake-lock.js';
import { createResultStore } from './result-store.js';
import * as welcome from './screens/welcome.js';
import * as pick from './screens/pick.js';
import * as shoot from './screens/shoot.js';
import * as review from './screens/review.js';
import * as adjust from './screens/adjust.js';
import * as result from './screens/result.js';

const SCREENS = { welcome, pick, shoot, review, adjust, result };
const STEPS = ['pick', 'shoot', 'adjust', 'result'];
const DEFAULT_SETTINGS = {
  countdown_seconds: 3,
  mirror_default: 1,
  kiosk_idle_seconds: 90,
  review_seconds: 3,
  sound_default: 1,
  contact_before: 0,
  video_enabled: 0,
};

const IDLE_WARN_MS = 10_000;
const newSession = () => ({ templateImg: null, target: null, selected: 0, pickMode: 'start' });

function createCtx(settings) {
  const state = createState();
  state.settings = settings;
  let current = null;
  let visits = 0;
  let kioskOn = isKioskOn();
  const resetHooks = [];
  const photoHooks = [];

  const ctx = {
    state,
    session: newSession(),
    settings,
    result: createResultStore(),
    wakeLock: createWakeLock(),
    kiosk: () => kioskOn,
    // timeout dibaca tiap tick: pengaturan server datang setelah booth dipasang
    idle: createIdleTimer({
      timeoutMs: () => Math.max(30, Number(settings.kiosk_idle_seconds) || 90) * 1000,
      warnMs: IDLE_WARN_MS,
    }),
    screen: () => current,
    visit: () => visits,
    onReset: (cb) => resetHooks.push(cb),
    onPhotoChanged: (cb) => photoHooks.push(cb),
    notifyPhotoChanged: (slot, oldCanvas) => photoHooks.forEach((cb) => cb(slot, oldCanvas)),
    resetSession() {
      resetAll(state);
      resetHooks.forEach((cb) => cb());
      ctx.result.invalidate();
      ctx.session = newSession();
    },
    go(name, params = {}) {
      if (!SCREENS[name]) throw new Error(`Layar tidak dikenal: ${name}`);
      if (current) SCREENS[current].leave(ctx);
      if (current === 'welcome') ctx.idle.resume();
      current = name;
      if (name === 'welcome') ctx.idle.pause();
      visits++;
      for (const section of $$('[data-screen]')) section.hidden = section.dataset.screen !== name;
      renderSteps(name);
      scrollTo(0, 0);
      SCREENS[name].enter(ctx, params);
      focusHeading(name, ctx, visits);
    },
  };
  ctx.setKioskOn = (on) => {
    kioskOn = on;
    persistKiosk(on);
    applyKioskLock(ctx, on);
  };
  return ctx;
}

// Fokus pindah ke judul layar baru agar pembaca layar tahu layar berganti (tanpa menggulir).
function focusHeading(name, ctx, visits) {
  if (name === 'welcome' && (ctx.kiosk() || visits === 1)) return;
  const heading = $(`[data-screen="${name}"] :is(h1, h2):not([hidden])`);
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

let detachIdle = null;

// Tamu berhenti di tengah sesi: buang semua state dan kembali ke sambutan (kamera tetap menyala).
function expireSession(ctx) {
  hideToast();
  for (const d of $$('dialog[open]')) d.close();
  if (!$('#save-overlay').hidden) $('#save-overlay-close').click();
  ctx.resetSession();
  ctx.go('welcome');
}

function applyKioskLock(ctx, on) {
  document.body.classList.toggle('kiosk', on);
  $('#kiosk-corner').hidden = !on;
  detachIdle?.();
  detachIdle = null;
  if (on) {
    ctx.idle.activity();
    detachIdle = attachIdle(ctx.idle, {
      onWarn: () =>
        showToast(t('kiosk.idle.warn', { s: IDLE_WARN_MS / 1000 }), {
          ms: IDLE_WARN_MS,
          action: { label: t('kiosk.idle.continue'), onClick: () => ctx.idle.activity() },
        }),
      onExpire: () => expireSession(ctx),
      onActive: hideToast,
    });
    ctx.wakeLock.acquire();
  } else {
    hideToast();
    // layar berpose memegang wake lock sendiri
    if (ctx.screen() !== 'shoot') ctx.wakeLock.release();
  }
  welcome.kioskChanged(ctx);
}

function renderSteps(name) {
  const steps = $('#steps');
  const key = name === 'review' ? 'shoot' : name;
  const idx = STEPS.indexOf(key);
  steps.hidden = idx < 0;
  $$('li', steps).forEach((li, i) => {
    if (i === idx) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    li.classList.toggle('done', i < idx);
  });
}

function initMenu() {
  const toggle = $('#menu-toggle');
  const panel = $('#menu-panel');
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !$('#booth-menu').contains(e.target)) setOpen(false);
  });
  const label = (p) => t(`common.theme.${p}`);
  bindThemeToggle($('#theme-toggle'), { label });
  bindLangSelect($('#lang-select'));
  bindThemeToggle($('#welcome-theme'), { label });
  onLangChange(refreshThemeToggles);
  bindLangSelect($('#welcome-lang'));
}

// Tombol suara hanya di luar kiosk; keadaan dibaca ulang setelah pengaturan server masuk.
function bindSoundToggle() {
  const btn = $('#sound-toggle');
  const sync = () => {
    const on = isEnabled();
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '\u{1F50A}' : '\u{1F507}';
  };
  btn.addEventListener('click', () => {
    unlock();
    setEnabled(!isEnabled());
    sync();
  });
  sync();
  return sync;
}

async function start() {
  initTheme();
  setLang(
    initialLang({
      stored: read(KEYS.lang),
      deviceDefault: read(KEYS.kioskLang),
      navigatorLang: navigator.language,
    }),
    { persist: false },
  );
  $('#booth-logo').textContent = PRODUCT_NAME;
  $('#welcome-title').textContent = PRODUCT_NAME;
  $('#welcome-kiosk-title').textContent = PRODUCT_NAME;
  initMenu();
  applyI18n(document);

  // Layar dipasang dulu dengan cadangan; pengaturan server menyusul di tempat yang sama.
  const ctx = createCtx({ ...DEFAULT_SETTINGS });
  initSound(ctx.settings);
  const syncSound = bindSoundToggle();
  const staffChanged = () => welcome.staffChanged(ctx);
  initKiosk(ctx, {
    onSoundChange: () => {
      syncSound();
      staffChanged();
    },
    onLangDefaultChange: staffChanged,
  });
  for (const screen of Object.values(SCREENS)) screen.init(ctx);
  document.addEventListener('contextmenu', (e) => {
    if (ctx.kiosk()) e.preventDefault();
  });
  // Sistem melepas wake lock saat tab tersembunyi tetapi held() masih true: lepas dulu.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !ctx.kiosk()) return;
    ctx.wakeLock.release();
    ctx.wakeLock.acquire();
  });
  applyKioskLock(ctx, ctx.kiosk());
  ctx.go('welcome');
  Object.assign(ctx.settings, await getJSON('/api/settings').catch(() => ({})));
  syncSound();
}

start().catch((err) => {
  console.error(err);
  document.querySelector('[data-screen="welcome"]').hidden = false;
});
