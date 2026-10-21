import { $ } from '../dom.js';
import { t } from '../../i18n.js';

const IN_APP_UA = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter/i;

export function init(ctx) {
  $('#start').addEventListener('click', () => ctx.go('pick', { mode: 'start' }));
  if (!IN_APP_UA.test(navigator.userAgent)) return;
  const link = $('#inapp-link');
  link.value = location.href;
  $('#inapp-banner').hidden = false;
  $('#inapp-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('#inapp-copy').textContent = t('booth.inapp.copied');
    } catch {
      link.focus();
      link.select();
    }
  });
  $('#inapp-close').addEventListener('click', () => {
    $('#inapp-banner').hidden = true;
  });
}

export function enter(ctx) {}
export function leave(ctx) {}
