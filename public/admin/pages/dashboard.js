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
