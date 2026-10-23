import { $, el, nextFrame } from '../dom.js';
import { t } from '../../i18n.js';
import { sendJSON } from '../../api.js';
import { filteredCanvas } from '../../filters.js';
import { releaseCanvas, resetPhotos, logSessionOnce } from '../../state.js';
import { render } from '../../strip.js';
import { goFirst } from './welcome.js';
import { clearFilteredCache } from './adjust.js';
import { resultButtonState } from '../result-view.js';
import { autoSend, resumeStatus, enterPanel, initPanel, leavePanel, setShareReady } from '../share-panel.js';

let phase = 'preparing';

function setPhase(next) {
  phase = next;
  const btn = $('#download');
  const { key, disabled } = resultButtonState(next);
  btn.dataset.i18n = key; // ikut berganti saat bahasa diubah
  btn.textContent = t(key);
  btn.disabled = disabled;
  setShareReady(next === 'ready');
}

function setError(key) {
  const status = $('#result-status');
  if (key) status.dataset.i18n = key;
  else delete status.dataset.i18n;
  status.textContent = key ? t(key) : '';
  status.className = key ? 'status-msg error' : 'status-msg';
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function prepareResult(ctx) {
  const job = ctx.result.begin();
  const { state, session } = ctx;
  const canvas = el('canvas');
  let blob;
  try {
    // Salinan tersaring resolusi penuh dibuat dan dilepas satu per slot (null untuk Normal).
    render(canvas, {
      template: state.template,
      img: session.templateImg,
      photos: state.photos,
      transforms: state.transforms,
      scale: 1,
      mapPhoto: (p) => filteredCanvas(p, state.filter),
    });
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  } finally {
    releaseCanvas(canvas);
  }
  if (!blob) throw new Error('toBlob');
  const file = new File([blob], `photobooth-${timestamp()}.jpg`, { type: 'image/jpeg' });
  return ctx.result.commit(job, file); // false bila sudah ada permintaan lebih baru atau reset
}

async function enterResult(ctx) {
  const visit = ctx.visit();
  setError(null);
  if (!ctx.result.current()) {
    setPhase('preparing');
    $('#result-img').removeAttribute('src');
    await nextFrame();
    await new Promise((r) => setTimeout(r, 0)); // biarkan tombol tergambar dulu
    if (ctx.visit() !== visit) return;
    try {
      await prepareResult(ctx);
    } catch {
      if (ctx.visit() !== visit) return;
      setError('booth.result.prepareError');
      setPhase('failed'); // tombol menjadi "Coba lagi"
      return;
    }
  }
  const current = ctx.result.current();
  if (ctx.visit() !== visit || !current) return;
  $('#result-img').src = current.url;
  setPhase('ready');
  autoSend(ctx);
  resumeStatus(ctx);
}

export async function download(ctx) {
  const current = ctx.result.current();
  if (!current) return;
  const { file } = current;
  if (ctx.state.template) {
    const templateId = ctx.state.template.id;
    logSessionOnce(ctx.state, () => sendJSON('POST', '/api/sessions', { template_id: templateId })).catch(() => {});
  }

  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
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

export function init(ctx) {
  initPanel(ctx);
  $('#download').addEventListener('click', () => (phase === 'failed' ? enterResult(ctx) : download(ctx)));
  $('#back-to-adjust').addEventListener('click', () => ctx.go('adjust'));
  $('#restart').addEventListener('click', () => {
    // lewat hook foto agar thumbnail filter ikut dibuang
    ctx.state.photos.forEach((photo, slot) => photo && ctx.notifyPhotoChanged(slot, photo));
    resetPhotos(ctx.state);
    clearFilteredCache();
    ctx.result.invalidate();
    ctx.session.target = null;
    ctx.session.selected = 0;
    ctx.go('shoot');
  });
  $('#new-session').addEventListener('click', () => {
    ctx.resetSession();
    if (ctx.kiosk()) ctx.go('welcome');
    else goFirst(ctx);
  });
}

export function enter(ctx) {
  enterPanel(ctx);
  enterResult(ctx);
}

export function leave() {
  leavePanel();
  $('#result-img').removeAttribute('src');
}
