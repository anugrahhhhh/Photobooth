import { getJSON } from './api.js';
import { PRODUCT_NAME } from './brand.js';
import { initTheme, bindThemeToggle, refreshThemeToggles } from './theme.js';
import { applyI18n, bindLangSelect, onLangChange, setLang, getLang, t } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const MAX_TEMPLATES = 5;

function showTemplates(list) {
  const row = $('#template-row');
  for (const tpl of list.slice(0, MAX_TEMPLATES)) {
    const img = document.createElement('img');
    img.src = tpl.thumb_url;
    img.alt = tpl.name;
    img.loading = 'lazy';
    const name = document.createElement('span');
    name.textContent = tpl.name;
    const li = document.createElement('li');
    li.className = 'card template-card';
    li.append(img, name);
    row.append(li);
  }
  for (const sel of ['#templates', '#nav-templates', '#hero-templates']) $(sel).hidden = false;
}

async function loadTemplates() {
  try {
    const list = await getJSON('/api/templates');
    if (Array.isArray(list) && list.length) showTemplates(list);
  } catch {
    // bagian template tetap tersembunyi
  }
}

function start() {
  initTheme();
  setLang(getLang(), { persist: false }); // pasang lang pada <html> dan terjemahkan halaman
  for (const sel of ['#nav-name', '#footer-name']) $(sel).textContent = PRODUCT_NAME;
  $('#footer-year').textContent = new Date().getFullYear();
  bindThemeToggle($('#theme-toggle'), { label: (p) => t(`common.theme.${p}`) });
  onLangChange(refreshThemeToggles);
  bindLangSelect($('#lang-select'));
  applyI18n();
  loadTemplates();
}

start();
