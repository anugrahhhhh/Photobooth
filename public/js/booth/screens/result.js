import { $, el, nextFrame } from '../dom.js';
import { t } from '../../i18n.js';
import { sendJSON } from '../../api.js';
import { filteredCanvas } from '../../filters.js';
import { releaseCanvas, resetPhotos, logSessionOnce } from '../../state.js';
import { render } from '../../strip.js';
import { goFirst } from './welcome.js';
import { clearFilteredCache } from './adjust.js';
import { resultButtonState } from '../result-view.js';
import { buildGif } from '../../media/gif.js';
import { autoSend, resumeStatus, enterPanel, initPanel, leavePanel, setShareReady, setShareFileProvider } from '../share-panel.js';

let phase = 'preparing';
let tab = 'photo'; // 'photo' | 'gif' | 'video'

// GIF dibuat satu kali per File hasil. File baru (foto, transform, atau filter berubah) = GIF lama
// dibuang; job menolak build lama yang selesai belakangan. Unggahan ke server lewat ctx.share.attachGif.
const gif = { job: 0, forFile: null, file: null, url: null, status: 'idle' };

// Video sesi direkam di layar Berpose (ctx.session.video); di sini hanya diputar dan diunggah.
const video = { blob: null, url: null, file: null };

function releaseVideo() {
  if (video.url) URL.revokeObjectURL(video.url);
  Object.assign(video, { blob: null, url: null, file: null });
  $('#result-video').removeAttribute('src');
  setMessage($('#video-status'), null, false);
  $('#tab-video').hidden = true;
  if (tab === 'video') tab = 'photo';
}

function syncVideo(ctx, current) {
  const sv = ctx.session.video;
  if (!sv) return releaseVideo();
  if (video.blob !== sv.blob) {
    releaseVideo();
    video.blob = sv.blob;
    video.url = URL.createObjectURL(sv.blob);
    video.file = new File([sv.blob], `photobooth-${timestamp()}.${sv.ext}`, { type: sv.blob.type });
    $('#result-video').src = video.url;
  }
  $('#tab-video').hidden = false;
  // File hasil baru (Atur ulang) = hasil server baru: unggah ulang video yang sama
  ctx.share.attachVideo(current.file, sv.blob, sv.ext, () => setMessage($('#video-status'), 'booth.result.videoTooBig', true));
}

function releaseGif() {
  if (gif.url) URL.revokeObjectURL(gif.url);
  Object.assign(gif, { job: gif.job + 1, forFile: null, file: null, url: null, status: 'idle' });
}

function gifReady() {
  return tab === 'gif' && gif.status === 'ready';
}

function renderGif() {
  const img = $('#gif-img');
  if (gif.url) img.src = gif.url;
  else img.removeAttribute('src');
  const key = { building: 'booth.result.gifBuilding', failed: 'booth.result.gifError' }[gif.status] ?? null;
  setMessage($('#gif-status'), key, gif.status === 'failed');
  syncDownload();
}

function renderTabs() {
  $('#tab-photo').setAttribute('aria-pressed', String(tab === 'photo'));
  $('#tab-gif').setAttribute('aria-pressed', String(tab === 'gif'));
  $('#tab-video').setAttribute('aria-pressed', String(tab === 'video'));
  $('#result-img').hidden = tab !== 'photo';
  $('#gif-view').hidden = tab !== 'gif';
  $('#video-view').hidden = tab !== 'video';
  if (tab !== 'video') $('#result-video').pause();
  syncDownload();
}

function syncDownload() {
  const btn = $('#download');
  if (phase === 'ready') btn.disabled = tab === 'gif' && gif.status !== 'ready';
}

async function startGif(ctx, forFile) {
  releaseGif();
  const job = gif.job;
  gif.forFile = forFile;
  gif.status = 'building';
  renderGif();
  const { template, photos, transforms, filter } = ctx.state;
  try {
    const blob = await buildGif({ template, photos: [...photos], transforms: [...transforms], filter });
    if (job !== gif.job) return;
    gif.file = new File([blob], `photobooth-${timestamp()}.gif`, { type: 'image/gif' });
    gif.url = URL.createObjectURL(blob);
    gif.status = 'ready';
    ctx.share.attachGif(forFile, blob);
  } catch {
    if (job !== gif.job) return;
    gif.status = 'failed'; // tab Foto tetap berfungsi
  }
  renderGif();
}

function setPhase(next) {
  phase = next;
  const btn = $('#download');
  const { key, disabled } = resultButtonState(next);
  btn.dataset.i18n = key; // ikut berganti saat bahasa diubah
  btn.textContent = t(key);
  btn.disabled = disabled;
  syncDownload();
  setShareReady(next === 'ready');
}

function setMessage(node, key, isError) {
  if (key) node.dataset.i18n = key;
  else delete node.dataset.i18n;
  node.textContent = key ? t(key) : '';
  node.className = isError ? 'status-msg error' : 'status-msg';
}

function setError(key) {
  setMessage($('#result-status'), key, Boolean(key));
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
  await ctx.session.videoPending; // klip terakhir mungkin masih ditutup
  if (ctx.visit() !== visit || ctx.result.current() !== current) return;
  $('#result-img').src = current.url;
  setPhase('ready');
  syncVideo(ctx, current);
  if (gif.forFile !== current.file) startGif(ctx, current.file);
  renderTabs();
  autoSend(ctx);
  resumeStatus(ctx);
}

function currentFile(current) {
  if (tab === 'video' && video.file) return video.file;
  return gifReady() ? gif.file : current.file;
}

export async function download(ctx) {
  const current = ctx.result.current();
  if (!current) return;
  const file = currentFile(current);
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
  setShareFileProvider(() => (tab === 'video' ? video.file : gifReady() ? gif.file : null));
  $('#tab-photo').addEventListener('click', () => ((tab = 'photo'), renderTabs()));
  $('#tab-gif').addEventListener('click', () => ((tab = 'gif'), renderTabs()));
  $('#tab-video').addEventListener('click', () => ((tab = 'video'), renderTabs()));
  ctx.onReset(() => {
    releaseGif();
    releaseVideo();
    tab = 'photo';
    renderGif();
    renderTabs();
  });
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
    // Ulang sesi: klip lama dibuang, urutan berikutnya merekam klip baru
    ctx.recorder?.discard();
    ctx.recorder = null;
    Object.assign(ctx.session, { video: null, videoTried: false, videoPending: null });
    releaseVideo();
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
