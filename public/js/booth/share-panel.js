import { $, el } from './dom.js';
import { getLang, t } from '../i18n.js';
import { isValidEmail, normalizeEmail, normalizePhone } from '../contact.js';

// Panel Kirim / Bagikan di layar Hasil. Respons yang datang setelah layar
// berganti atau sesi di-reset diabaikan: tidak ada QR yang bocor ke tamu berikutnya.

const POLL_MS = 2000;
// Jeda ulang server 30 s + 120 s: 3 menit menutupi percobaan terakhir sampai status 'failed'.
const POLL_MAX_MS = 180_000;

const CHANNELS = {
  email: { form: '#share-email-form', input: '#share-email', btn: '#share-email-send', err: '#share-email-err', label: 'booth.share.email' },
  whatsapp: { form: '#share-wa-form', input: '#share-wa', btn: '#share-wa-send', err: '#share-wa-err', label: 'booth.share.whatsapp' },
};

let ready = false;
let pending = null; // aksi yang menunggu persetujuan
let pollTimer = 0;
let pollGen = 0;
const busy = { email: false, whatsapp: false };
const lastTo = { email: null, whatsapp: null }; // alamat mentah untuk "coba lagi"

function setText(node, key, isError) {
  if (key) node.dataset.i18n = key;
  else delete node.dataset.i18n;
  node.textContent = key ? t(key) : '';
  if (isError !== undefined) node.className = isError ? 'status-msg error' : 'status-msg';
}

function setStatus(key, isError = false) {
  setText($('#share-status'), key, isError);
}

function setChannelErr(channel, key) {
  setText($(CHANNELS[channel].err), key);
}

function syncButtons() {
  $('#share-qr').disabled = !ready;
  $('#share-native').disabled = !ready;
  for (const [ch, c] of Object.entries(CHANNELS)) $(c.btn).disabled = !ready || busy[ch];
}

function stopPolling() {
  pollGen++;
  clearTimeout(pollTimer);
  pollTimer = 0;
}

function clearPanel() {
  stopPolling();
  pending = null;
  busy.email = busy.whatsapp = false;
  lastTo.email = lastTo.whatsapp = null;
  $('#share-out').hidden = true;
  setStatus(null);
  const img = $('#share-qr-img');
  img.hidden = true;
  img.removeAttribute('src');
  $('#share-url').hidden = true;
  $('#share-url').textContent = '';
  $('#share-retry').hidden = true;
  const list = $('#share-deliveries');
  list.replaceChildren();
  list.hidden = true;
  for (const c of Object.values(CHANNELS)) {
    $(c.input).value = '';
    setText($(c.err), null);
  }
  syncButtons();
}

export function setShareReady(value) {
  ready = value;
  syncButtons();
}

// Status kiriman: selalu textContent, tidak pernah innerHTML.
function renderDeliveries(ctx, list, stale = false) {
  const ul = $('#share-deliveries');
  ul.hidden = list.length === 0;
  ul.replaceChildren(
    ...list.map((d) => {
      const active = d.status === 'queued' || d.status === 'sending';
      const statusKey = { sent: 'booth.share.sent', failed: 'booth.share.sendFailed' }[d.status] ?? (stale ? 'booth.share.stale' : 'booth.share.sending');
      const label = el('span', { className: 'share-delivery-label', textContent: t(CHANNELS[d.channel]?.label ?? 'booth.share.send') });
      label.dataset.i18n = CHANNELS[d.channel]?.label ?? 'booth.share.send';
      const to = el('span', { className: 'share-delivery-to', textContent: String(d.to ?? '') });
      const st = el('span', { className: `share-delivery-status ${d.status}`, textContent: t(statusKey) });
      st.dataset.i18n = statusKey;
      const li = el('li', { className: 'share-delivery' }, label, to, st);
      if ((d.status === 'failed' || (stale && active)) && lastTo[d.channel]) {
        const retry = el('button', { type: 'button', className: 'btn', textContent: t('common.retry') });
        retry.dataset.i18n = 'common.retry';
        retry.addEventListener('click', () => sendTo(ctx, d.channel, lastTo[d.channel]));
        li.append(retry);
      }
      return li;
    }),
  );
}

// Polling tiap 2 detik selama ada queued/sending, sampai POLL_MAX_MS.
function startPolling(ctx) {
  stopPolling();
  const gen = pollGen;
  const visit = ctx.visit();
  const startedAt = Date.now();
  const tick = async () => {
    let list;
    try {
      list = await ctx.share.deliveries();
    } catch {
      list = null;
    }
    if (gen !== pollGen || ctx.visit() !== visit) return;
    const active = !list || list.some((d) => d.status === 'queued' || d.status === 'sending');
    const expired = Date.now() - startedAt >= POLL_MAX_MS;
    if (list) renderDeliveries(ctx, list, active && expired);
    if (active && !expired) pollTimer = setTimeout(tick, POLL_MS);
  };
  pollTimer = setTimeout(tick, 0);
}

function errorKey(err) {
  if (err.status === 429) return 'booth.share.limit';
  if (err.status === 409) return 'booth.share.serviceOff';
  return 'booth.share.sendError';
}

async function sendTo(ctx, channel, to) {
  const current = ctx.result.current();
  if (!current || busy[channel]) return;
  const epoch = ctx.share.epoch(); // batal hanya oleh reset sesi, bukan oleh pindah layar
  busy[channel] = true; // terkunci sinkron: ketukan kedua diabaikan
  syncButtons();
  setChannelErr(channel, null);
  lastTo[channel] = to;
  try {
    await ctx.share.send(channel, to, { file: current.file, templateId: ctx.state.template?.id ?? null, lang: getLang() });
    if (ctx.share.epoch() !== epoch) return;
    if (ctx.screen() === 'result') startPolling(ctx);
  } catch (err) {
    if (ctx.share.epoch() !== epoch || err.status === undefined) return; // reset di tengah jalan
    if (err.status === 507) setChannelErr(channel, 'booth.share.full');
    else if (err.status === 422) setChannelErr(channel, channel === 'email' ? 'booth.share.invalidEmail' : 'booth.share.invalidPhone');
    else setChannelErr(channel, errorKey(err));
  } finally {
    if (ctx.share.epoch() === epoch) {
      busy[channel] = false;
      syncButtons();
    }
  }
}

// Kembali ke layar Hasil (Atur membuat File baru): tampilkan lagi status kiriman sesi ini.
export function resumeStatus(ctx) {
  if (ctx.share.current()) startPolling(ctx);
}

// Kirim otomatis dari kontak awal: sekali, hanya untuk File pertama sesi.
export function autoSend(ctx) {
  const contact = ctx.session.contact;
  const current = ctx.result.current();
  if (!contact || !current || !ctx.session.consent) return;
  if (!ctx.share.claimAutoSend(current.file)) return;
  if (contact.email && ctx.settings.share_email) sendTo(ctx, 'email', contact.email);
  if (contact.phone && ctx.settings.share_whatsapp) sendTo(ctx, 'whatsapp', contact.phone);
}

function submitChannel(ctx, channel) {
  const c = CHANNELS[channel];
  const raw = $(c.input).value;
  const to = channel === 'email' ? normalizeEmail(raw) : normalizePhone(raw);
  const valid = channel === 'email' ? isValidEmail(to) : Boolean(to);
  if (!valid) {
    setChannelErr(channel, channel === 'email' ? 'booth.share.invalidEmail' : 'booth.share.invalidPhone');
    return;
  }
  setChannelErr(channel, null);
  const run = () => sendTo(ctx, channel, to);
  if (ctx.session.consent) run();
  else {
    pending = run;
    $('#consent-dialog').showModal();
  }
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
  // pengaturan server datang setelah booth dipasang: dibaca setiap masuk
  $(CHANNELS.email.form).hidden = !ctx.settings.share_email;
  $(CHANNELS.whatsapp.form).hidden = !ctx.settings.share_whatsapp;
  const contact = ctx.session.contact;
  if (contact?.email) $(CHANNELS.email.input).value = contact.email;
  if (contact?.phone) $(CHANNELS.whatsapp.input).value = contact.phone;
  $('#share-native').hidden = !(
    !ctx.kiosk() &&
    matchMedia('(pointer: coarse)').matches &&
    typeof navigator.share === 'function'
  );
}

export function initPanel(ctx) {
  const dialog = $('#consent-dialog');
  const start = () => {
    if (ctx.session.consent) return sendQr(ctx);
    pending = () => sendQr(ctx);
    dialog.showModal();
  };
  $('#share-qr').addEventListener('click', start);
  $('#share-retry').addEventListener('click', start);
  $('#share-native').addEventListener('click', () => nativeShare(ctx));
  for (const channel of Object.keys(CHANNELS)) {
    $(CHANNELS[channel].form).addEventListener('submit', (e) => {
      e.preventDefault();
      if (!busy[channel]) submitChannel(ctx, channel);
    });
  }
  $('#consent-agree').addEventListener('click', () => {
    dialog.close();
    ctx.session.consent = true;
    const run = pending ?? (() => sendQr(ctx));
    pending = null;
    run();
  });
  $('#consent-cancel').addEventListener('click', () => {
    pending = null;
    dialog.close();
  });
  ctx.onReset(() => {
    dialog.close();
    clearPanel();
  });
}
