import { $ } from '../dom.js';
import { isValidEmail, normalizeEmail, normalizePhone } from '../../contact.js';
import { t } from '../../i18n.js';

// Layar kontak sebelum sesi (opsional): isian hanya untuk layanan yang aktif.

function setErr(sel, key) {
  const node = $(sel);
  if (key) node.dataset.i18n = key;
  else delete node.dataset.i18n;
  node.textContent = key ? t(key) : '';
}

// Lanjut aktif bila minimal satu kontak valid, tidak ada yang tidak valid, dan persetujuan dicentang.
function refresh() {
  const waRaw = $('#contact-wa-field').hidden ? '' : $('#contact-wa').value.trim();
  const emRaw = $('#contact-email-field').hidden ? '' : $('#contact-email').value.trim();
  const phone = waRaw ? normalizePhone(waRaw) : null;
  const email = emRaw ? normalizeEmail(emRaw) : null;
  const phoneBad = Boolean(waRaw) && !phone;
  const emailBad = Boolean(emRaw) && !isValidEmail(email);
  setErr('#contact-wa-err', phoneBad ? 'booth.share.invalidPhone' : null);
  setErr('#contact-email-err', emailBad ? 'booth.share.invalidEmail' : null);
  const hasValid = Boolean(phone) || (Boolean(email) && !emailBad);
  $('#contact-next').disabled = !($('#contact-consent').checked && hasValid && !phoneBad && !emailBad);
  return { phone, email };
}

function clear() {
  $('#contact-wa').value = '';
  $('#contact-email').value = '';
  $('#contact-consent').checked = false;
  $('#contact-next').disabled = true;
  setErr('#contact-wa-err', null);
  setErr('#contact-email-err', null);
}

export function init(ctx) {
  for (const id of ['#contact-wa', '#contact-email', '#contact-consent']) {
    $(id).addEventListener('input', refresh);
    $(id).addEventListener('change', refresh);
  }
  $('#contact-next').addEventListener('click', () => {
    const { phone, email } = refresh();
    if ($('#contact-next').disabled) return;
    ctx.session.contact = { email, phone };
    ctx.session.consent = true;
    ctx.go('pick', { mode: 'start' });
  });
  $('#contact-skip').addEventListener('click', () => ctx.go('pick', { mode: 'start' }));
  ctx.onReset(clear);
}

export function enter(ctx) {
  clear();
  $('#contact-wa-field').hidden = !ctx.settings.share_whatsapp;
  $('#contact-email-field').hidden = !ctx.settings.share_email;
}

export function leave() {
  clear();
}
