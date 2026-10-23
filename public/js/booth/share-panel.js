import { $ } from './dom.js';
import { getLang, t } from '../i18n.js';

// Panel Kirim / Bagikan di layar Hasil. Respons yang datang setelah layar
// berganti atau sesi di-reset diabaikan: tidak ada QR yang bocor ke tamu berikutnya.

function setStatus(key, isError = false) {
  const status = $('#share-status');
  if (key) status.dataset.i18n = key;
  else delete status.dataset.i18n;
  status.textContent = key ? t(key) : '';
  status.className = isError ? 'status-msg error' : 'status-msg';
}

function clearPanel() {
  $('#share-out').hidden = true;
  setStatus(null);
  const img = $('#share-qr-img');
  img.hidden = true;
  img.removeAttribute('src');
  $('#share-url').hidden = true;
  $('#share-url').textContent = '';
  $('#share-retry').hidden = true;
}

export function setShareReady(ready) {
  $('#share-qr').disabled = !ready;
  $('#share-native').disabled = !ready;
}

async function sendQr(ctx) {
  const current = ctx.result.current();
  if (!current) return;
  const visit = ctx.visit();
  const btn = $('#share-qr');
  btn.disabled = true;
  $('#share-out').hidden = false;
  $('#share-retry').hidden = true;
  $('#share-qr-img').hidden = true;
  $('#share-url').hidden = true;
  setStatus('booth.share.uploading');
  try {
    const result = await ctx.share.ensureResult(current.file, {
      templateId: ctx.state.template?.id ?? null,
      lang: getLang(),
    });
    if (ctx.visit() !== visit || !ctx.share.current()) return;
    const img = $('#share-qr-img');
    img.src = `/api/results/${encodeURIComponent(result.token)}/qr.svg`;
    img.hidden = false;
    $('#share-url').textContent = result.url;
    $('#share-url').hidden = false;
    setStatus(null);
    btn.disabled = false;
  } catch (err) {
    if (ctx.visit() !== visit) return;
    setStatus(err.status === 507 ? 'booth.share.full' : 'booth.share.failed', true);
    $('#share-retry').hidden = err.status === 507;
    btn.disabled = false;
  }
}

async function nativeShare(ctx) {
  const current = ctx.result.current();
  if (!current) return;
  try {
    await navigator.share({ files: [current.file] });
  } catch (err) {
    if (err.name === 'AbortError') return;
    $('#share-out').hidden = false;
    setStatus('booth.share.failed', true);
  }
}

export function leavePanel() {
  $('#consent-dialog').close();
  clearPanel();
}

export function enterPanel(ctx) {
  clearPanel();
  $('#consent-dialog').close();
  $('#share-native').hidden = !(
    !ctx.kiosk() &&
    matchMedia('(pointer: coarse)').matches &&
    typeof navigator.share === 'function'
  );
}

export function initPanel(ctx) {
  const dialog = $('#consent-dialog');
  const start = () => (ctx.session.consent ? sendQr(ctx) : dialog.showModal());
  $('#share-qr').addEventListener('click', start);
  $('#share-retry').addEventListener('click', start);
  $('#share-native').addEventListener('click', () => nativeShare(ctx));
  $('#consent-agree').addEventListener('click', () => {
    dialog.close();
    ctx.session.consent = true;
    sendQr(ctx);
  });
  $('#consent-cancel').addEventListener('click', () => dialog.close());
  ctx.onReset(() => {
    dialog.close();
    clearPanel();
  });
}
