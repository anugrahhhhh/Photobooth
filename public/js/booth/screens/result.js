import { $, el, nextFrame } from '../dom.js';
import { t } from '../../i18n.js';
import { sendJSON } from '../../api.js';
import { filteredCanvas } from '../../filters.js';
import { releaseCanvas, resetPhotos, logSessionOnce } from '../../state.js';
import { render } from '../../strip.js';
import { clearFilteredCache } from './adjust.js';

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function prepareResult(ctx) {
  const job = ctx.result.begin();
  const { state, session } = ctx;
  const canvas = el('canvas');
  // Salinan tersaring resolusi penuh dibuat dan dilepas satu per slot (null untuk Normal).
  render(canvas, {
    template: state.template,
    img: session.templateImg,
    photos: state.photos,
    transforms: state.transforms,
    scale: 1,
    mapPhoto: (p) => filteredCanvas(p, state.filter),
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  releaseCanvas(canvas);
  if (!blob) throw new Error(t('booth.result.prepareError'));
  const file = new File([blob], `photobooth-${timestamp()}.jpg`, { type: 'image/jpeg' });
  return ctx.result.commit(job, file); // false bila sudah ada permintaan lebih baru atau reset
}

async function enterResult(ctx) {
  const visit = ctx.visit();
  const btn = $('#download');
  const status = $('#result-status');
  status.textContent = '';
  status.className = 'status-msg';
  if (!ctx.result.current()) {
    btn.disabled = true;
    btn.textContent = t('booth.result.preparing');
    $('#result-img').removeAttribute('src');
    await nextFrame();
    await new Promise((r) => setTimeout(r, 0)); // biarkan tombol tergambar dulu
    if (ctx.visit() !== visit) return;
    try {
      await prepareResult(ctx);
    } catch (err) {
      if (ctx.visit() !== visit) return;
      status.textContent = err.message;
      status.className = 'status-msg error';
      return;
    }
  }
  const current = ctx.result.current();
  if (ctx.visit() !== visit || !current) return;
  $('#result-img').src = current.url;
  btn.disabled = false;
  btn.textContent = t('booth.result.download');
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
  $('#download').addEventListener('click', () => download(ctx));
  $('#back-to-adjust').addEventListener('click', () => ctx.go('adjust'));
  $('#restart').addEventListener('click', () => {
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
    else ctx.go('pick', { mode: 'start' });
  });
}

export function enter(ctx) {
  enterResult(ctx);
}

export function leave() {
  $('#result-img').removeAttribute('src');
}
