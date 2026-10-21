import { PRODUCT_NAME } from '../js/brand.js';
import { bindThemeToggle } from '../js/theme.js';
import { sendJSON } from '../js/api.js';
import { $, el, svg, setStatus, LOGIN_URL } from './common.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard.html', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { key: 'templates', label: 'Template', href: '/admin/templates.html', icon: 'M4 4h16v16H4zM4 9h16M9 9v11' },
  { key: 'settings', label: 'Pengaturan', href: '/admin/settings.html', icon: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M8 16v4' },
];

function icon(path) {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    svg('path', { d: path }),
  );
}

// Sidebar admin. Di bawah 768px menjadi bilah atas dengan menu yang bisa dilipat.
export function renderShell(active) {
  const menuToggle = el('button', { type: 'button', className: 'btn btn-icon shell-menu', ariaLabel: 'Menu' }, icon('M4 6h16M4 12h16M4 18h16'));
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-controls', 'shell-nav');

  const links = NAV.map((n) => {
    const a = el('a', { className: 'shell-link', href: n.href }, icon(n.icon), n.label);
    if (n.key === active) a.setAttribute('aria-current', 'page');
    return a;
  });

  const themeBtn = el('button', { type: 'button', className: 'btn btn-icon' });
  bindThemeToggle(themeBtn);
  const logout = el('button', { type: 'button', className: 'btn shell-logout' }, 'Keluar');
  logout.addEventListener('click', async () => {
    await sendJSON('POST', '/api/auth/logout').catch(() => {});
    location.href = LOGIN_URL;
  });

  const nav = el(
    'nav',
    { id: 'shell-nav', className: 'shell-nav', ariaLabel: 'Navigasi admin' },
    ...links,
    el('div', { className: 'shell-foot' }, el('a', { className: 'shell-link', href: '/booth', target: '_blank', rel: 'noopener' }, 'Buka booth ↗'), el('div', { className: 'shell-tools' }, themeBtn, logout)),
  );

  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });

  const shell = el(
    'aside',
    { className: 'shell' },
    el('div', { className: 'shell-head' }, el('a', { className: 'shell-brand', href: '/admin/dashboard.html' }, el('span', { className: 'logo', ariaHidden: 'true' }), PRODUCT_NAME), menuToggle),
    nav,
  );
  document.body.prepend(shell);
  return shell;
}

// halaman → { pemuat modul, tampilkan shell, menu aktif di sidebar }
const pages = {
  login: { load: () => import('./pages/login.js'), shell: false },
  dashboard: { load: () => import('./pages/dashboard.js'), shell: true, active: 'dashboard' },
  templates: { load: () => import('./pages/templates.js'), shell: true, active: 'templates' },
  edit: { load: () => import('./pages/edit.js'), shell: true, active: 'templates' },
  settings: { load: () => import('./pages/settings.js'), shell: true, active: 'settings' },
};

const name = document.body.dataset.page;
const page = pages[name];
if (page) {
  if (page.shell) renderShell(page.active);
  page
    .load()
    .then((m) => m.init())
    .catch((err) => {
      const status = $('.status-msg');
      if (status) setStatus(status, err.message, 'error');
      console.error(err);
    });
}
