import { sendJSON } from '../../js/api.js';
import { $, setStatus } from '../common.js';

export function init() {
  const form = $('#login-form');
  const status = $('#login-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button');
    button.disabled = true;
    setStatus(status, 'Memeriksa…');
    try {
      await sendJSON('POST', '/api/auth/login', data);
      location.href = '/admin/dashboard.html';
    } catch (err) {
      if (err.status === 429) {
        const minutes = err.retryAfter ? Math.ceil(err.retryAfter / 60) : 15;
        setStatus(status, `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`, 'error');
      } else if (err.status === 401) {
        setStatus(status, 'Username atau password salah', 'error');
      } else {
        setStatus(status, err.message, 'error');
      }
      button.disabled = false;
    }
  });
}
