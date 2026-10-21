import { ApiError, getJSON, sendJSON, sendForm } from '../js/api.js';

export const LOGIN_URL = '/admin/login.html';
export const STATUS_LABEL = { active: 'Aktif', inactive: 'Nonaktif', archived: 'Arsip' };

export const $ = (sel) => document.querySelector(sel);

// Elemen DOM tanpa innerHTML: el('td', { className: 'num' }, 'teks', childNode)
export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

// Elemen SVG tanpa innerHTML: svg('svg', { viewBox: '0 0 24 24' }, svg('path', { d: '...' }))
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export function setStatus(node, message, kind = '') {
  node.textContent = message;
  node.className = `status-msg ${kind}`.trim();
}

// Pembungkus api.js untuk halaman yang butuh login: 401 di panggilan mana pun → halaman login.
async function guard(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      location.href = LOGIN_URL;
      return new Promise(() => {}); // berhenti di sini selama pindah halaman
    }
    throw err;
  }
}

export const adminApi = {
  get: (url) => guard(getJSON(url)),
  json: (method, url, body) => guard(sendJSON(method, url, body)),
  form: (method, url, formData) => guard(sendForm(method, url, formData)),
};

export function button(label, onClick, className = 'btn btn-sm') {
  const b = el('button', { type: 'button', className, textContent: label });
  b.addEventListener('click', onClick);
  return b;
}
