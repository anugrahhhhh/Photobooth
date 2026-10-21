import { $, $$ } from './dom.js';
import { getJSON } from '../api.js';
import { PRODUCT_NAME } from '../brand.js';
import { KEYS, read } from '../storage.js';
import { initTheme, bindThemeToggle } from '../theme.js';
import { applyI18n, bindLangSelect, initialLang, setLang } from '../i18n.js';
import { createState, resetAll } from '../state.js';
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
  mirror_output: 0,
  kiosk_idle_seconds: 90,
  review_seconds: 3,
  sound_default: 1,
  kiosk_available: false,
};

const newSession = () => ({ templateImg: null, target: null, selected: 0, pickMode: 'start' });

function createCtx(settings) {
  const state = createState();
  state.settings = settings;
  let current = null;
  let visits = 0;
  const resetHooks = [];
  const photoHooks = [];

  const ctx = {
    state,
    session: newSession(),
    settings,
    result: createResultStore(),
    wakeLock: createWakeLock(),
    screen: () => current,
    visit: () => visits,
    onReset: (cb) => resetHooks.push(cb),
    onPhotoChanged: (cb) => photoHooks.push(cb),
    notifyPhotoChanged: (slot) => photoHooks.forEach((cb) => cb(slot)),
    resetSession() {
      resetAll(state);
      resetHooks.forEach((cb) => cb());
      ctx.result.invalidate();
      ctx.session = newSession();
    },
    go(name, params = {}) {
      if (!SCREENS[name]) throw new Error(`Layar tidak dikenal: ${name}`);
      if (current) SCREENS[current].leave(ctx);
      current = name;
      visits++;
      for (const section of $$('[data-screen]')) section.hidden = section.dataset.screen !== name;
      renderSteps(name);
      scrollTo(0, 0);
      SCREENS[name].enter(ctx, params);
    },
  };
  return ctx;
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
  bindThemeToggle($('#theme-toggle'));
  bindLangSelect($('#lang-select'));
  bindThemeToggle($('#welcome-theme'));
  bindLangSelect($('#welcome-lang'));
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
  initMenu();
  applyI18n(document);

  // Layar dipasang dulu dengan cadangan; pengaturan server menyusul di tempat yang sama.
  const ctx = createCtx({ ...DEFAULT_SETTINGS });
  for (const screen of Object.values(SCREENS)) screen.init(ctx);
  ctx.go('welcome');
  Object.assign(ctx.settings, await getJSON('/api/settings').catch(() => ({})));
}

start().catch((err) => {
  console.error(err);
  document.querySelector('[data-screen="welcome"]').hidden = false;
});
