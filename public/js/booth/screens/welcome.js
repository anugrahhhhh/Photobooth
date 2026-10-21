import { $, el } from '../dom.js';
import { getJSON } from '../../api.js';
import { t, getLang, initialLang, onLangChange, setLang } from '../../i18n.js';
import { deviceLang } from '../../kiosk.js';
import { isEnabled, unlock } from '../../sound.js';

const IN_APP_UA = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter/i;
const SLIDE_MS = 4000;

let ctxRef = null;
let slideTimer = 0;
let loadToken = 0;

function start(ctx) {
  if (ctx.screen() !== 'welcome') return;
  unlock(); // ketukan pertama membuka audio
  // dipanggil dari gestur pengguna (click/keydown), jadi fullscreen diizinkan
  if (ctx.kiosk() && document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  ctx.go('pick', { mode: 'start' });
}

export function init(ctx) {
  ctxRef = ctx;
  $('#start').addEventListener('click', () => start(ctx));
  // click (bukan pointerdown): untuk sentuhan, hanya pointerup/click yang dihitung sebagai gestur fullscreen
  $('#welcome-kiosk').addEventListener('click', () => start(ctx));
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    if (!ctx.kiosk() || ctx.screen() !== 'welcome' || document.querySelector('dialog[open]')) return;
    if (e.target.id === 'welcome-tap') return; // tombol memicu click sendiri
    e.preventDefault();
    start(ctx);
  });
  onLangChange(() => {
    if (ctx.kiosk() && ctx.screen() === 'welcome') renderCaption();
  });
  if (!IN_APP_UA.test(navigator.userAgent)) return;
  const link = $('#inapp-link');
  link.value = location.href;
  $('#inapp-banner').hidden = false;
  $('#inapp-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('#inapp-copy').textContent = t('booth.inapp.copied');
    } catch {
      link.focus();
      link.select();
    }
  });
  $('#inapp-close').addEventListener('click', () => {
    $('#inapp-banner').hidden = true;
  });
}

function renderCaption() {
  $('#welcome-caption').textContent = `${t(isEnabled() ? 'booth.welcome.soundOn' : 'booth.welcome.soundOff')} · ${t(`booth.welcome.lang.${getLang()}`)}`;
}

function stopSlides() {
  clearInterval(slideTimer);
  slideTimer = 0;
  loadToken++;
}

// Thumbnail template aktif berganti pelan; disembunyikan bila kosong atau gagal dimuat.
async function startSlides() {
  stopSlides();
  const token = loadToken;
  const box = $('#welcome-slides');
  box.hidden = true;
  box.replaceChildren();
  let list;
  try {
    list = await getJSON('/api/templates');
  } catch {
    return;
  }
  if (token !== loadToken || !Array.isArray(list) || !list.length) return;
  const imgs = list.map((tpl, i) => el('img', { src: tpl.thumb_url, alt: '', className: i === 0 ? 'active' : '', draggable: false }));
  box.replaceChildren(...imgs);
  box.hidden = false;
  if (imgs.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  slideTimer = setInterval(() => {
    imgs[i].classList.remove('active');
    i = (i + 1) % imgs.length;
    imgs[i].classList.add('active');
  }, SLIDE_MS);
}

export function enter(ctx) {
  if (!ctx.kiosk()) return;
  // Setiap kembali ke sambutan, bahasa kembali ke bawaan perangkat
  setLang(deviceLang() ?? initialLang({ navigatorLang: navigator.language }), { persist: false });
  renderCaption();
  startSlides();
}

export function leave() {
  stopSlides();
}

// Dipanggil saat kiosk dinyalakan atau dimatikan; sambutan yang sedang tampil menyesuaikan diri.
export function kioskChanged(ctx) {
  if (ctx.screen() !== 'welcome') return;
  stopSlides();
  enter(ctx);
}
