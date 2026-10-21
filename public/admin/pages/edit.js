import { render } from '../../js/strip.js';
import { previewScale } from '../../js/geometry.js';
import { validateCanvas, validateSlots, MAX_SLOTS } from '../../js/slots.js';
import { detectSlots } from '../../js/detect-slots.js';
import { $, el, setStatus, adminApi, button, STATUS_LABEL } from '../common.js';

const THUMB_SIDE = 400;
const THUMB_SLOT_COLOR = '#9e9e9e';

function solidCanvas(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// Thumbnail JPEG: PNG template di atas warna latar, slot diisi abu-abu netral.
export function makeThumbnail(img, template) {
  const canvas = document.createElement('canvas');
  const scale = THUMB_SIDE / Math.max(template.canvas_w, template.canvas_h);
  const gray = solidCanvas(THUMB_SLOT_COLOR);
  render(canvas, { template, img, photos: template.slots.map(() => gray), scale });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat thumbnail'))), 'image/jpeg', 0.85),
  );
}

function samplePhoto(i) {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 300;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${(i * 67) % 360} 70% 62%)`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgb(0 0 0 / 55%)';
  ctx.font = 'bold 160px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(i + 1), c.width / 2, c.height / 2);
  return c;
}

function readAlpha(img, w, h) {
  const c = el('canvas', { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  c.width = c.height = 0;
  return alpha;
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak bisa dibuka'));
    img.src = url;
  });
}

export async function init() {
  await adminApi.get('/api/auth/me');

  const form = $('#editor');
  const status = $('#status');
  const preview = $('#preview');
  const slotList = $('#slot-list');
  const saveBtn = $('#save');
  const activateBtn = $('#activate');
  const samples = Array.from({ length: MAX_SLOTS }, (_, i) => samplePhoto(i));

  const state = {
    id: Number(new URLSearchParams(location.search).get('id')) || null,
    img: null, // HTMLImageElement template
    imageFile: null, // File baru yang dipilih (null = pakai yang tersimpan)
    canvas_w: 0,
    canvas_h: 0,
    slots: [],
    saved: null, // { slots, bg_color, status } versi tersimpan
    dirty: false,
    validation: { errors: [], slotErrors: [], overlaps: [] },
  };

  if (state.id) {
    const templates = await adminApi.get('/api/admin/templates');
    const t = templates.find((x) => x.id === state.id);
    if (!t) {
      setStatus(status, 'Template tidak ditemukan', 'error');
      return;
    }
    $('#title').textContent = `Edit: ${t.name}`;
    form.name.value = t.name;
    form.bg_color.value = t.bg_color;
    Object.assign(state, { canvas_w: t.canvas_w, canvas_h: t.canvas_h, slots: t.slots.map((s) => ({ ...s })) });
    state.saved = { slots: JSON.stringify(t.slots), bg_color: t.bg_color, status: t.status };
    state.img = await loadImageFromUrl(t.image_url);
  }

  form.image.addEventListener('change', async () => {
    const file = form.image.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      state.img = await loadImageFromUrl(url);
      state.imageFile = file;
      state.canvas_w = state.img.naturalWidth;
      state.canvas_h = state.img.naturalHeight;
      if (!state.slots.length) addSlot();
      changed();
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  form.name.addEventListener('input', changed);
  form.bg_color.addEventListener('input', changed);

  function addSlot() {
    if (state.slots.length >= MAX_SLOTS) return;
    const w = Math.max(1, Math.round(state.canvas_w * 0.4));
    const h = Math.max(1, Math.round(state.canvas_h * 0.2));
    state.slots.push({ x: Math.round((state.canvas_w - w) / 2), y: Math.round((state.canvas_h - h) / 2), w, h });
  }

  $('#add-slot').addEventListener('click', () => {
    addSlot();
    changed();
  });

  $('#detect-slots').addEventListener('click', async () => {
    const detectStatus = $('#detect-status');
    const btn = $('#detect-slots');
    btn.disabled = true;
    setStatus(detectStatus, 'Sedang memproses…');
    // Beri kesempatan indikator tergambar sebelum pekerjaan berat di thread utama.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const found = detectSlots(readAlpha(state.img, state.canvas_w, state.canvas_h), state.canvas_w, state.canvas_h);
      if (found.length === 0) {
        setStatus(detectStatus, 'Tidak ada area transparan yang cukup besar. Isi slot secara manual.', 'error');
      } else if (found.length > MAX_SLOTS) {
        setStatus(detectStatus, `Terdeteksi ${found.length} area, lebih dari ${MAX_SLOTS}. Daftar slot tidak diubah.`, 'error');
      } else {
        state.slots = found;
        setStatus(detectStatus, `${found.length} slot terdeteksi. Periksa urutannya sebelum menyimpan.`, 'ok');
        changed();
      }
    } catch (err) {
      setStatus(detectStatus, `Deteksi gagal: ${err.message}`, 'error');
    } finally {
      btn.disabled = !state.img;
    }
  });

  function renderSlotRows() {
    const { slotErrors, overlaps } = state.validation;
    const overlapping = new Set(overlaps.flat());
    const rows = state.slots.map((slot, i) => {
      const row = el('div', { className: 'slot-row' });
      if (slotErrors.includes(i)) row.classList.add('error');
      else if (overlapping.has(i)) row.classList.add('overlap');
      row.append(el('span', {}, String(i + 1)));
      for (const key of ['x', 'y', 'w', 'h']) {
        const input = el('input', { type: 'number', step: '1', value: String(slot[key]), ariaLabel: `Slot ${i + 1} ${key}` });
        input.addEventListener('input', () => {
          slot[key] = input.value === '' ? NaN : Number(input.value);
          changed({ keepRows: true });
        });
        row.append(input);
      }
      const move = (delta) => {
        const j = i + delta;
        if (j < 0 || j >= state.slots.length) return;
        [state.slots[i], state.slots[j]] = [state.slots[j], state.slots[i]];
        changed();
      };
      const actions = el('div', { className: 'slot-actions' });
      const up = button('↑', () => move(-1));
      const down = button('↓', () => move(1));
      const remove = button('✕', () => {
        state.slots.splice(i, 1);
        changed();
      });
      up.ariaLabel = `Naikkan slot ${i + 1}`;
      down.ariaLabel = `Turunkan slot ${i + 1}`;
      remove.ariaLabel = `Hapus slot ${i + 1}`;
      up.disabled = i === 0;
      down.disabled = i === state.slots.length - 1;
      actions.append(up, down, remove);
      row.append(actions);
      return row;
    });
    slotList.replaceChildren(...rows);
    $('#add-slot').disabled = state.slots.length >= MAX_SLOTS || !state.img;
    $('#detect-slots').disabled = !state.img;
  }

  // Tandai baris tanpa membangun ulang input (agar fokus tidak hilang saat mengetik).
  function markSlotRows() {
    const { slotErrors, overlaps } = state.validation;
    const overlapping = new Set(overlaps.flat());
    [...slotList.children].forEach((row, i) => {
      row.classList.toggle('error', slotErrors.includes(i));
      row.classList.toggle('overlap', !slotErrors.includes(i) && overlapping.has(i));
    });
  }

  function currentTemplate() {
    return {
      canvas_w: state.canvas_w,
      canvas_h: state.canvas_h,
      slots: state.slots,
      bg_color: form.bg_color.value,
    };
  }

  function validate() {
    const canvasErrors = state.img ? validateCanvas(state.canvas_w, state.canvas_h) : ['Pilih file PNG template'];
    const v = validateSlots(state.slots, state.canvas_w, state.canvas_h);
    const nameError = form.name.value.trim() ? [] : ['Nama wajib diisi'];
    state.validation = { ...v, errors: [...canvasErrors, ...nameError, ...v.errors] };
  }

  function renderMessages() {
    const items = [
      ...state.validation.errors.map((m) => el('li', { className: 'error' }, m)),
      ...state.validation.overlaps.map(([a, b]) => el('li', { className: 'warn' }, `Slot ${a + 1} dan ${b + 1} tumpang tindih`)),
    ];
    $('#messages').replaceChildren(...items);
  }

  let frame = 0;
  function schedulePreview() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawPreview);
  }

  function drawPreview() {
    if (!state.img) return;
    const box = preview.parentElement;
    const scale = previewScale(state.canvas_w, state.canvas_h, box.clientWidth - 40, innerHeight * 0.75, devicePixelRatio || 1);
    // Slot error tidak diisi foto contoh; nomor foto tetap mengikuti nomor slot.
    const keep = state.slots.map((_, i) => i).filter((i) => !state.validation.slotErrors.includes(i));
    render(preview, {
      template: { ...currentTemplate(), slots: keep.map((i) => state.slots[i]) },
      img: state.img,
      photos: keep.map((i) => samples[i]),
      scale,
    });
    const ctx = preview.getContext('2d');
    const overlapping = new Set(state.validation.overlaps.flat());
    const line = Math.max(2, Math.round(2 * Math.min(devicePixelRatio || 1, 2)));
    state.slots.forEach((s, i) => {
      if (![s.x, s.y, s.w, s.h].every(Number.isFinite)) return;
      ctx.lineWidth = line;
      ctx.strokeStyle = state.validation.slotErrors.includes(i) ? '#e03131' : overlapping.has(i) ? '#f2b705' : '#1c7ed6';
      ctx.setLineDash(state.validation.slotErrors.includes(i) ? [] : [line * 3, line * 2]);
      ctx.strokeRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
    });
  }

  function hasVisualChanges() {
    if (!state.saved) return true;
    return Boolean(state.imageFile) || JSON.stringify(state.slots) !== state.saved.slots || form.bg_color.value !== state.saved.bg_color;
  }

  function updateButtons() {
    const ok = state.validation.errors.length === 0;
    saveBtn.disabled = !ok;
    activateBtn.disabled = !ok || !state.id || state.dirty || state.saved?.status === 'active';
  }

  function changed({ keepRows = false, dirty = true } = {}) {
    if (dirty) state.dirty = true;
    form.canvas_w.value = state.canvas_w || '';
    form.canvas_h.value = state.canvas_h || '';
    validate();
    if (keepRows) markSlotRows();
    else renderSlotRows();
    renderMessages();
    updateButtons();
    schedulePreview();
  }

  addEventListener('resize', schedulePreview);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    validate();
    if (state.validation.errors.length) return changed({ dirty: false });
    saveBtn.disabled = true;
    setStatus(status, 'Menyimpan…');
    try {
      const fd = new FormData();
      fd.append('name', form.name.value.trim());
      fd.append('bg_color', form.bg_color.value);
      fd.append('slots', JSON.stringify(state.slots));
      if (state.imageFile) {
        fd.append('canvas_w', String(state.canvas_w));
        fd.append('canvas_h', String(state.canvas_h));
        fd.append('image', state.imageFile, state.imageFile.name || 'template.png');
      }
      if (hasVisualChanges()) fd.append('thumb', await makeThumbnail(state.img, currentTemplate()), 'thumb.jpg');

      const saved = state.id
        ? await adminApi.form('PUT', `/api/admin/templates/${state.id}`, fd)
        : await adminApi.form('POST', '/api/admin/templates', fd);

      state.id = saved.id;
      state.imageFile = null;
      form.image.value = '';
      state.saved = { slots: JSON.stringify(saved.slots), bg_color: saved.bg_color, status: saved.status };
      state.dirty = false;
      history.replaceState(null, '', `?id=${saved.id}`);
      $('#title').textContent = `Edit: ${saved.name}`;
      const label = STATUS_LABEL[saved.status] ?? saved.status;
      setStatus(status, saved.status === 'active' ? 'Tersimpan. Template tetap aktif.' : `Tersimpan sebagai ${label.toLowerCase()}. Tekan Aktifkan agar tampil di booth.`, 'ok');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
    changed({ dirty: false });
  });

  activateBtn.addEventListener('click', async () => {
    activateBtn.disabled = true;
    try {
      const t = await adminApi.json('PATCH', `/api/admin/templates/${state.id}/status`, { status: 'active' });
      state.saved.status = t.status;
      setStatus(status, 'Template aktif dan tampil di booth.', 'ok');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
    updateButtons();
  });

  changed({ dirty: false });
}
