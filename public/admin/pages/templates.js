import { $, el, setStatus, adminApi, button, STATUS_LABEL } from '../common.js';
import { filterTemplates } from '../templates-filter.js';

export async function init() {
  const status = $('#status');
  const search = $('#search');
  const statusFilter = $('#status-filter');
  let all = [];

  const render = () => {
    const shown = filterTemplates(all, { query: search.value, status: statusFilter.value });
    const empty = $('#templates-empty');
    empty.hidden = shown.length > 0;
    empty.textContent = all.length === 0 ? 'Belum ada template. Buat template baru untuk memulai.' : 'Tidak ada yang cocok';
    $('#templates').replaceChildren(...shown.map((t) => row(t, refresh, status)));
  };

  async function refresh() {
    try {
      all = await adminApi.get('/api/admin/templates');
      render();
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  }

  search.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  await refresh();
}

function row(t, refresh, status) {
  const act = async (fn, okMessage) => {
    try {
      await fn();
      setStatus(status, okMessage, 'ok');
      await refresh();
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  };
  const setTemplateStatus = (next, msg) => act(() => adminApi.json('PATCH', `/api/admin/templates/${t.id}/status`, { status: next }), msg);

  const actions = el('div', { className: 'actions' });
  actions.append(el('a', { className: 'btn btn-sm', href: `/admin/template-edit.html?id=${t.id}`, textContent: 'Edit' }));
  if (t.status === 'active') {
    actions.append(button('Nonaktifkan', () => setTemplateStatus('inactive', `"${t.name}" dinonaktifkan`)));
  } else {
    actions.append(button('Aktifkan', () => setTemplateStatus('active', `"${t.name}" diaktifkan`)));
  }
  if (t.status !== 'archived') {
    actions.append(button('Arsipkan', () => setTemplateStatus('archived', `"${t.name}" diarsipkan`)));
  }
  if (t.usage_count === 0) {
    const del = button('Hapus', () => {
      if (!confirm(`Hapus template "${t.name}" secara permanen?`)) return;
      act(() => adminApi.json('DELETE', `/api/admin/templates/${t.id}`), `"${t.name}" dihapus`);
    });
    del.className = 'btn btn-sm btn-danger';
    actions.append(del);
  }

  return el(
    'tr',
    {},
    el('td', { className: 'c-thumb' }, el('img', { className: 'thumb', src: t.thumb_url, alt: '', loading: 'lazy' })),
    el('td', { className: 'c-name' }, t.name),
    metaCell('Ukuran', `${t.canvas_w}×${t.canvas_h}`),
    metaCell('Slot', String(t.photo_count)),
    el('td', { className: 'c-status' }, el('span', { className: `badge ${t.status}` }, STATUS_LABEL[t.status] ?? t.status)),
    metaCell('Dipakai', String(t.usage_count)),
    el('td', { className: 'c-actions' }, actions),
  );
}

// Sel angka; label dipakai tampilan kartu di layar sempit (atribut data-label).
function metaCell(label, value) {
  const td = el('td', { className: 'num c-meta' }, value);
  td.setAttribute('data-label', label);
  return td;
}
