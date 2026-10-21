import { $, el } from '../dom.js';
import { t, onLangChange } from '../../i18n.js';
import { getJSON } from '../../api.js';
import { loadTemplateImage } from '../../strip.js';
import { changeTemplate, resetAll, wouldDrop, nextEmptySlot, latestOnly } from '../../state.js';
import { slotCountChips, filterBySlots } from '../models.js';

const picking = latestOnly();
let ctxRef = null;
let templates = [];
let filterCount = null; // null = Semua
let loadingId = null;

export function init(ctx) {
  ctxRef = ctx;
  $('#pick-back').addEventListener('click', () => ctx.go('adjust'));
  $('#pick-retry').addEventListener('click', () => loadTemplates());
  // Chip dan label jumlah foto ikut bahasa baru.
  onLangChange(() => {
    if (ctx.screen() === 'pick' && templates.length) renderList();
  });
}

export function enter(ctx, { mode = 'start' } = {}) {
  ctx.session.pickMode = mode;
  filterCount = null;
  const title = $('#pick-title');
  title.dataset.i18n = mode === 'change' ? 'booth.pick.changeTitle' : 'booth.pick.title';
  title.textContent = t(title.dataset.i18n);
  $('#pick-back').hidden = mode !== 'change';
  loadTemplates();
}

export function leave(ctx) {
  picking.cancel();
  loadingId = null;
}

function setStatus(text, error = false) {
  const status = $('#pick-status');
  status.className = error ? 'status-msg error' : 'status-msg';
  status.textContent = text;
}

async function loadTemplates() {
  const ctx = ctxRef;
  const visit = ctx.visit();
  $('#pick-retry').hidden = true;
  $('#pick-chips').replaceChildren();
  $('#template-grid').replaceChildren();
  setStatus(t('booth.pick.loading'));
  try {
    const list = await getJSON('/api/templates');
    if (ctx.visit() !== visit) return; // layar sudah ditinggalkan
    templates = list;
    setStatus(list.length ? '' : t('booth.pick.empty'));
    renderList();
  } catch {
    if (ctx.visit() !== visit) return;
    setStatus(t('booth.pick.loadError'), true);
    $('#pick-retry').hidden = false;
  }
}

function renderList() {
  const busy = picking.pending();
  $('#pick-chips').replaceChildren(
    ...slotCountChips(templates).map((count) => {
      const chip = el(
        'button',
        { type: 'button', className: 'chip' },
        count == null ? t('booth.pick.all') : t('booth.pick.nPhotos', { n: count }),
      );
      chip.setAttribute('aria-pressed', String(count === filterCount));
      chip.disabled = busy;
      chip.addEventListener('click', () => {
        filterCount = count;
        renderList();
      });
      return chip;
    }),
  );
  $('#template-grid').replaceChildren(
    ...filterBySlots(templates, filterCount).map((tpl) => {
      const loading = loadingId === tpl.id;
      const card = el(
        'button',
        { type: 'button', className: 'template-card card' },
        el('img', { src: tpl.thumb_url, alt: '', loading: 'lazy' }),
        el('span', {}, tpl.name),
        el('small', {}, loading ? t('booth.pick.loadingOne') : t('booth.pick.nPhotos', { n: tpl.slots.length })),
      );
      card.disabled = busy;
      if (loading) card.setAttribute('aria-busy', 'true');
      card.addEventListener('click', () => pickTemplate(tpl));
      return card;
    }),
  );
}

async function pickTemplate(tpl) {
  const ctx = ctxRef;
  if (picking.pending()) return; // satu template dimuat dalam satu waktu
  const token = picking.begin();
  const visit = ctx.visit();
  loadingId = tpl.id;
  setStatus('');
  renderList();
  try {
    const img = await loadTemplateImage(tpl.image_url);
    if (!picking.isCurrent(token) || ctx.visit() !== visit) return; // sudah ditinggalkan
    const { state, session } = ctx;
    if (session.pickMode === 'change') {
      const n = wouldDrop(state, tpl);
      if (n > 0 && !confirm(t('booth.pick.confirmDrop', { slots: tpl.slots.length, n }))) return;
    } else {
      resetAll(state);
    }
    session.templateImg = img;
    session.target = null;
    changeTemplate(state, tpl);
    ctx.result.invalidate();
    ctx.go(nextEmptySlot(state) >= 0 ? 'shoot' : 'adjust');
  } catch {
    if (!picking.isCurrent(token)) return;
    setStatus(t('booth.pick.templateError'), true);
  } finally {
    picking.done(token);
    if (ctx.visit() === visit) {
      loadingId = null;
      renderList();
    }
  }
}
