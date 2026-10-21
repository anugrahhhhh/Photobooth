import { getJSON } from '../../js/api.js';
import { renderBarChart } from '../chart.js';
import { $, el, setStatus, adminApi } from '../common.js';

export async function init() {
  const status = $('#status');
  await adminApi.get('/api/auth/me');

  const refresh = async () => {
    try {
      renderStats(await adminApi.get('/api/admin/stats'));
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  };

  initSettingsForm();
  await refresh();
}

function renderStats(stats) {
  $('#stat-today').textContent = stats.sessions_today;
  $('#stat-7d').textContent = stats.sessions_7d;
  $('#stat-active').textContent = stats.templates.active;
  $('#stat-top-name').textContent = stats.top[0]?.name ?? '–';
  renderBarChart($('#chart'), stats.daily);
  $('#top-list').replaceChildren(
    ...stats.top.slice(0, 5).map((t) => el('li', {}, el('span', { className: 'top-name', textContent: t.name }), el('span', { className: 'num', textContent: `${t.count} sesi` }))),
  );
  $('#top-empty').hidden = stats.top.length > 0;
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
