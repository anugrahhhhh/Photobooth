import { $, el } from '../common.js';

// Placeholder: Task 6.2 menggantikan halaman ini.
export function init() {
  $('#content').replaceChildren(el('h1', {}, 'Template'), el('p', { className: 'status-msg' }, 'Segera hadir'));
}
