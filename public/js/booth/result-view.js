// Tampilan tombol utama layar hasil per fase. Kunci i18n disimpan di data-i18n agar ikut bahasa baru.
export const RESULT_PHASES = ['preparing', 'ready', 'failed'];

export function resultButtonState(phase) {
  switch (phase) {
    case 'ready':
      return { key: 'booth.result.download', disabled: false };
    case 'failed':
      return { key: 'common.retry', disabled: false };
    default:
      return { key: 'booth.result.preparing', disabled: true };
  }
}
