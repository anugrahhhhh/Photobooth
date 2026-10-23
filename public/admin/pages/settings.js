import { $, setStatus, adminApi } from '../common.js';

const PIN_RE = /^\d{4,8}$/;

// Satuan 1024; angka dibulatkan agar mudah dibaca ("310 MB", "1,5 GB").
export function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace('.0', '').replace('.', ',');
  return `${text} ${units[i]}`;
}

export async function init() {
  const form = $('#settings-form');
  const status = $('#settings-status');
  const pinForm = $('#pin-form');
  const pinInput = $('#pin');
  const pinState = $('#pin-state');
  const pinStatus = $('#pin-status');
  const pinDelete = $('#pin-delete');

  const fill = (s) => {
    form.countdown_seconds.value = s.countdown_seconds;
    form.mirror_default.checked = s.mirror_default === 1;
    form.review_seconds.value = s.review_seconds;
    form.kiosk_idle_seconds.value = s.kiosk_idle_seconds;
    form.sound_default.checked = s.sound_default === 1;
    form.contact_before.checked = s.contact_before === 1;
    form.video_enabled.checked = s.video_enabled === 1;
  };

  // Status PIN dari kiosk_available; PIN-nya sendiri tidak pernah dikirim ke klien.
  const load = async ({ withFields = true } = {}) => {
    const s = await adminApi.get('/api/settings');
    if (withFields) fill(s);
    const has = Boolean(s.kiosk_available);
    pinState.textContent = has ? 'PIN sudah diatur' : 'PIN belum diatur';
    pinDelete.disabled = !has;
  };

  // Formulir terkunci sampai muat awal berhasil: gagal muat tidak boleh membuka jalan menyimpan nilai kosong.
  const setLocked = (locked) => {
    for (const c of [...form.elements, ...pinForm.elements]) c.disabled = locked;
  };
  setLocked(true);
  try {
    await adminApi.get('/api/auth/me'); // belum login: dialihkan ke halaman login
    await load();
    setLocked(false);
    pinDelete.disabled = !pinState.textContent.startsWith('PIN sudah');
  } catch (err) {
    setStatus(status, err.message, 'error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(pinStatus, '');
    try {
      fill(
        await adminApi.json('PUT', '/api/admin/settings', {
          countdown_seconds: Number(form.countdown_seconds.value),
          mirror_default: form.mirror_default.checked ? 1 : 0,
          review_seconds: Number(form.review_seconds.value),
          kiosk_idle_seconds: Number(form.kiosk_idle_seconds.value),
          sound_default: form.sound_default.checked ? 1 : 0,
          contact_before: form.contact_before.checked ? 1 : 0,
          video_enabled: form.video_enabled.checked ? 1 : 0,
        }),
      );
      setStatus(status, 'Pengaturan tersimpan', 'ok');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(status, '');
    if (!PIN_RE.test(pinInput.value)) {
      setStatus(pinStatus, 'PIN harus 4–8 angka', 'error');
      return;
    }
    try {
      await adminApi.json('PUT', '/api/admin/kiosk-pin', { pin: pinInput.value });
      pinInput.value = '';
      await load({ withFields: false });
      setStatus(pinStatus, 'PIN tersimpan', 'ok');
    } catch (err) {
      setStatus(pinStatus, err.message, 'error');
    }
  });

  initResults();

  pinDelete.addEventListener('click', async () => {
    if (!confirm('Hapus PIN kiosk?')) return;
    setStatus(status, '');
    try {
      await adminApi.json('PUT', '/api/admin/kiosk-pin', { pin: null });
      pinInput.value = '';
      await load({ withFields: false });
      setStatus(pinStatus, 'PIN dihapus', 'ok');
    } catch (err) {
      setStatus(pinStatus, err.message, 'error');
    }
  });
}

function initResults() {
  const storageLine = $('#storage-line');
  const delBtn = $('#results-delete');
  const delStatus = $('#results-status');
  const testForm = $('#test-email-form');
  const testStatus = $('#test-email-status');
  const testBtn = $('#test-email-send');

  const svc = (node, on) => {
    node.textContent = on ? 'Aktif ✓' : 'Belum diatur';
  };

  const load = async () => {
    try {
      const s = await adminApi.get('/api/admin/results/summary');
      svc($('#svc-email'), s.services.email);
      svc($('#svc-whatsapp'), s.services.whatsapp);
      $('#svc-deliveries').textContent = `${s.deliveries_24h.count} / ${s.deliveries_24h.limit}`;
      testBtn.disabled = !s.services.email;
      storageLine.textContent = `${s.count} hasil · ${formatBytes(s.bytes)} dari ${formatBytes(s.disk_total)}`;
      delBtn.disabled = s.count === 0;
    } catch (err) {
      storageLine.textContent = '–';
      setStatus(delStatus, err.message, 'error');
    }
  };

  testForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = $('#test-email').value.trim();
    if (!to) {
      setStatus(testStatus, 'Isi alamat email tujuan', 'error');
      return;
    }
    testBtn.disabled = true;
    setStatus(testStatus, 'Mengirim…');
    try {
      await adminApi.json('POST', '/api/admin/test-email', { to });
      setStatus(testStatus, `Email uji terkirim ke ${to}`, 'ok');
    } catch (err) {
      setStatus(testStatus, err.message, 'error');
    } finally {
      testBtn.disabled = false;
    }
  });

  delBtn.addEventListener('click', async () => {
    if (!confirm('Hapus semua hasil tamu? Tautan yang sudah dikirim tidak akan bisa dibuka lagi.')) return;
    delBtn.disabled = true;
    setStatus(delStatus, '');
    try {
      await adminApi.json('DELETE', '/api/admin/results');
      await load();
      setStatus(delStatus, 'Semua hasil dihapus', 'ok');
    } catch (err) {
      setStatus(delStatus, err.message, 'error');
      delBtn.disabled = false;
    }
  });

  load();
}
