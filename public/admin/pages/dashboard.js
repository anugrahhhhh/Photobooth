import { getJSON } from '../../js/api.js';
import { $, el, setStatus, adminApi, button, STATUS_LABEL } from '../common.js';

export async function init() {
  const status = $('#status');
  await adminApi.get('/api/auth/me');

  const refresh = async () => {
    try {
      const [stats, templates] = await Promise.all([adminApi.get('/api/admin/stats'), adminApi.get('/api/admin/templates')]);
      renderStats(stats);
      renderTemplates(templates, refresh, status);
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  };

  initSettingsForm();
  await refresh();
}

function renderStats(stats) {
  $('#stat-today').textContent = stats.sessions_today;
  $('#stat-active').textContent = stats.templates.active;
  $('#stat-inactive').textContent = stats.templates.inactive;
  $('#stat-archived').textContent = stats.templates.archived;
  $('#stat-top').replaceChildren(...stats.top.map((t) => el('li', {}, `${t.name} (${t.count})`)));
  $('#stat-top-empty').hidden = stats.top.length > 0;
}

function renderTemplates(templates, refresh, status) {
  $('#templates-empty').hidden = templates.length > 0;
  const act = async (fn, okMessage) => {
    try {
      await fn();
      setStatus(status, okMessage, 'ok');
      await refresh();
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  };
  const setTemplateStatus = (t, next, msg) =>
    act(() => adminApi.json('PATCH', `/api/admin/templates/${t.id}/status`, { status: next }), msg);

  const rows = templates.map((t) => {
    const actions = el('div', { className: 'actions' });
    actions.append(el('a', { className: 'btn btn-sm', href: `/admin/template-edit.html?id=${t.id}`, textContent: 'Edit' }));
    if (t.status === 'active') {
      actions.append(button('Nonaktifkan', () => setTemplateStatus(t, 'inactive', `"${t.name}" dinonaktifkan`)));
    } else {
      actions.append(button('Aktifkan', () => setTemplateStatus(t, 'active', `"${t.name}" diaktifkan`)));
    }
    if (t.status !== 'archived') {
      actions.append(button('Arsipkan', () => setTemplateStatus(t, 'archived', `"${t.name}" diarsipkan`)));
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
      el('td', {}, el('img', { className: 'thumb', src: t.thumb_url, alt: '', loading: 'lazy' })),
      el('td', {}, t.name),
      el('td', { className: 'num' }, `${t.canvas_w}×${t.canvas_h}`),
      el('td', { className: 'num' }, String(t.photo_count)),
      el('td', {}, el('span', { className: `badge ${t.status}` }, STATUS_LABEL[t.status] ?? t.status)),
      el('td', { className: 'num' }, String(t.usage_count)),
      el('td', {}, actions),
    );
  });
  $('#templates').replaceChildren(...rows);
}

async function initSettingsForm() {
  const form = $('#settings-form');
  const status = $('#settings-status');
  const fill = (s) => {
    form.countdown_seconds.value = s.countdown_seconds;
    form.mirror_output.checked = s.mirror_output === 1;
  };
  try {
    fill(await getJSON('/api/settings'));
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      fill(
        await adminApi.json('PUT', '/api/admin/settings', {
          countdown_seconds: Number(form.countdown_seconds.value),
          mirror_output: form.mirror_output.checked ? 1 : 0,
        }),
      );
      setStatus(status, 'Pengaturan tersimpan', 'ok');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });
}
