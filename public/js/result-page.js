import { getJSON } from './api.js';
import { PRODUCT_NAME } from './brand.js';
import { initTheme, bindThemeToggle, refreshThemeToggles } from './theme.js';
import { applyI18n, onLangChange, setLang, getLang, t } from './i18n.js';

const POLL_MS = 5000;
const POLL_MAX_AGE_MS = 10 * 60_000;
const RESULT_TTL_MS = 7 * 24 * 60 * 60_000; // sama dengan RESULT_TTL_DAYS di server

const $ = (sel) => document.querySelector(sel);
const token = location.pathname.split('/').filter(Boolean)[1] ?? '';
let result = null;
let pollTimer = null;

function showMessage(key) {
  $('#state-msg').textContent = t(key);
  $('#state-msg').dataset.i18n = key;
  $('#state-msg').hidden = false;
  $('#content').hidden = true;
}

function setDownload(link, url) {
  link.href = `${url}?download=1`;
}

function renderMedia() {
  $('#photo-img').src = result.photo_url;
  setDownload($('#photo-download'), result.photo_url);

  const gifReady = Boolean(result.gif_url);
  if (gifReady) {
    $('#gif-img').src = result.gif_url;
    setDownload($('#gif-download'), result.gif_url);
  }
  $('#gif-img').hidden = !gifReady;
  $('#gif-download').hidden = !gifReady;
  $('#gif-wait').hidden = gifReady;

  // Video hanya ditampilkan bila sudah ada; fitur video bisa dimatikan di booth.
  const videoReady = Boolean(result.video_url);
  $('#video-item').hidden = !videoReady;
  if (videoReady) {
    const video = $('#video-el');
    if (video.getAttribute('src') !== result.video_url) video.src = result.video_url;
    setDownload($('#video-download'), result.video_url);
  }
}

function renderText() {
  if (!result) return;
  const date = new Date(result.expires_at).toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric' });
  $('#expiry').textContent = t('result.expiry', { date });
  const text = `${t('result.share.text')} ${location.href}`;
  $('#wa-share').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function showResult(data) {
  result = data;
  $('#state-msg').hidden = true;
  $('#content').hidden = false;
  renderMedia();
  renderText();
}

function needsPolling() {
  const age = Date.now() - (new Date(result.expires_at).getTime() - RESULT_TTL_MS);
  return !result.gif_url && age < POLL_MAX_AGE_MS;
}

async function load(first) {
  try {
    const data = await getJSON(`/api/results/${encodeURIComponent(token)}`);
    if (first) setLang(data.lang, { persist: false });
    showResult(data);
    if (needsPolling()) pollTimer = setTimeout(() => load(false), POLL_MS);
  } catch (err) {
    if (err.status === 410) showMessage('result.deleted');
    else if (err.status === 404) showMessage('result.notFound');
    else if (first) showMessage('result.error');
    else pollTimer = setTimeout(() => load(false), POLL_MS); // gangguan jaringan sesaat saat polling
  }
}

function start() {
  initTheme();
  setLang(getLang(), { persist: false });
  $('#brand').textContent = PRODUCT_NAME;
  bindThemeToggle($('#theme-toggle'), { label: (p) => t(`common.theme.${p}`) });
  onLangChange(() => {
    refreshThemeToggles();
    renderText();
  });
  // Bahasa dipilih di sini tidak boleh menimpa pilihan bahasa booth (pb.lang).
  const select = $('#lang-select');
  select.value = getLang();
  select.addEventListener('change', () => setLang(select.value, { persist: false }));
  onLangChange((lang) => {
    select.value = lang;
  });

  if (navigator.share) {
    $('#native-share').hidden = false;
    $('#native-share').addEventListener('click', () => {
      navigator.share({ title: PRODUCT_NAME, text: t('result.share.text'), url: location.href }).catch(() => {});
    });
  }
  applyI18n();
  load(true);
}

start();
