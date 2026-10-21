import { $, el } from '../common.js';

// Placeholder: Task 6.4 menggantikan halaman ini.
export function init() {
  $('#content').replaceChildren(el('h1', {}, 'Pengaturan'), el('p', { className: 'status-msg' }, 'Segera hadir'));
}
