import id from './i18n/id.js';
import en from './i18n/en.js';
import { KEYS, read, write } from './storage.js';

const LANGS = ['id', 'en'];

/* ---------- Bagian murni (diuji di Node) ---------- */

export function createTranslator(dicts, { lang = 'id', warn = console.warn } = {}) {
  let current = lang;
  const warned = new Set();
  return {
    t(key, params) {
      let text = dicts[current]?.[key] ?? dicts.id?.[key];
      if (text === undefined) {
        if (!warned.has(key)) {
          warned.add(key);
          warn(`i18n: kunci tidak ditemukan: ${key}`);
        }
        text = key;
      }
      if (!params) return text;
      return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
    },
    setLang(next) {
      current = next;
    },
    getLang: () => current,
  };
}

export function initialLang({ stored, deviceDefault, navigatorLang } = {}) {
  if (LANGS.includes(stored)) return stored;
  if (LANGS.includes(deviceDefault)) return deviceDefault;
  if (typeof navigatorLang === 'string' && navigatorLang.toLowerCase().startsWith('en')) return 'en';
  return 'id';
}

/* ---------- Instans default (DOM hanya disentuh di dalam fungsi) ---------- */

const translator = createTranslator({ id, en });
const listeners = new Set();
let started = false;

// Bahasa ditentukan sekali, saat pertama kali dibutuhkan.
function ensureStarted() {
  if (started) return;
  started = true;
  translator.setLang(
    initialLang({
      stored: read(KEYS.lang),
      deviceDefault: read(KEYS.kioskLang),
      navigatorLang: globalThis.navigator?.language,
    }),
  );
}

export function t(key, params) {
  ensureStarted();
  return translator.t(key, params);
}

export function getLang() {
  ensureStarted();
  return translator.getLang();
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function setLang(lang, { persist = true } = {}) {
  if (!LANGS.includes(lang)) return;
  ensureStarted();
  translator.setLang(lang);
  if (persist) write(KEYS.lang, lang);
  document.documentElement.lang = lang;
  applyI18n(document);
  for (const cb of listeners) cb(lang);
}

export function onLangChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function bindLangSelect(select) {
  select.value = getLang();
  select.addEventListener('change', () => setLang(select.value));
  onLangChange((lang) => {
    select.value = lang;
  });
}
