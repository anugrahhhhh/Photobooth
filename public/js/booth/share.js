import { sendForm, putRaw } from '../api.js';

const defaultApi = {
  createResult: (form) => sendForm('POST', '/api/results', form),
  putAsset: (token, key, kind, blob) => putRaw(`/api/results/${token}/${kind}`, blob, { 'X-Result-Key': key }),
};

// Satu hasil di server per objek File. Reset menaikkan versi: janji yang masih
// berjalan tetap selesai, tetapi hasilnya dibuang dan tidak pernah jadi current().
export function createShareSession({ api = defaultApi, now = Date.now } = {}) {
  let version = 0;
  let entry = null; // { file, promise, result }

  function ensureResult(file, { templateId, lang }) {
    if (entry && entry.file === file) return entry.promise;
    const mine = { file, promise: null, result: null };
    const v = version;
    const form = new FormData();
    form.append('photo', file, file.name || 'photo.jpg');
    if (templateId != null) form.append('template_id', String(templateId));
    form.append('lang', lang);
    form.append('consent', '1');
    mine.promise = api.createResult(form).then(
      (res) => {
        const result = { token: res.token, key: res.key, url: res.url, expiresAt: res.expires_at, at: now() };
        if (v === version && entry === mine) mine.result = result;
        return result;
      },
      (err) => {
        if (entry === mine) entry = null;
        throw err;
      },
    );
    entry = mine;
    return mine.promise;
  }

  async function uploadAsset(kind, blob) {
    const mine = entry;
    if (!mine) throw new Error('Belum ada hasil untuk diunggah');
    const v = version;
    await mine.promise;
    if (v !== version || entry !== mine) return;
    await api.putAsset(mine.result.token, mine.result.key, kind, blob);
  }

  return {
    ensureResult,
    uploadAsset,
    current: () => (entry?.result ? { token: entry.result.token, key: entry.result.key, url: entry.result.url } : null),
    reset() {
      version++;
      entry = null;
    },
  };
}
