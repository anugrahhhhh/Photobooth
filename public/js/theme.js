import { KEYS, read, write } from './storage.js';

export const THEME_PREFS = ['system', 'light', 'dark'];

const DARK_QUERY = '(prefers-color-scheme: dark)';
const ICONS = { system: '\u25D0', light: '\u2600', dark: '\u263E' };
const LABELS = { system: 'Tema: ikuti sistem', light: 'Tema: terang', dark: 'Tema: gelap' };

export const defaultThemeLabel = (pref) => LABELS[pref];

export function readThemePref(store) {
  const v = read(KEYS.theme, store);
  return THEME_PREFS.includes(v) ? v : 'system';
}

export function nextThemePref(pref) {
  const i = THEME_PREFS.indexOf(pref);
  return THEME_PREFS[(i + 1) % THEME_PREFS.length];
}

export function resolveTheme(pref, systemDark) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}

/* ---------- Bagian DOM (hanya menyentuh document di dalam fungsi) ---------- */

function systemDark() {
  return Boolean(globalThis.matchMedia?.(DARK_QUERY).matches);
}

function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref, systemDark()));
}

export function initTheme() {
  applyTheme(readThemePref());
  globalThis.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => applyTheme(readThemePref()));
}

// Semua tombol tema di halaman ikut diperbarui saat pilihan berubah atau bahasa berganti.
const toggles = new Map(); // tombol -> fungsi label

export function refreshThemeToggles() {
  const pref = readThemePref();
  for (const [button, label] of toggles) {
    const text = label(pref);
    button.textContent = ICONS[pref];
    button.setAttribute('aria-label', text);
    button.title = text;
  }
}

export function bindThemeToggle(button, { label = defaultThemeLabel } = {}) {
  toggles.set(button, label);
  refreshThemeToggles();
  button.addEventListener('click', () => {
    const pref = nextThemePref(readThemePref());
    write(KEYS.theme, pref);
    applyTheme(pref);
    refreshThemeToggles();
  });
}
