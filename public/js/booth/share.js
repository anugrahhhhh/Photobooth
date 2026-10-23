import { sendForm, putRaw, ApiError } from '../api.js';

const KEY_HEADER = 'X-Result-Key';

// Fetch dengan header kunci; respons non-2xx jadi ApiError(status).
async function keyed(method, url, key, body) {
  const headers = { [KEY_HEADER]: key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // respons bukan JSON
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Permintaan gagal (${res.status})`);
  return data;
}

const defaultApi = {
  createResult: (form) => sendForm('POST', '/api/results', form),
  putAsset: (token, key, kind, blob) => putRaw(`/api/results/${token}/${kind}`, blob, { [KEY_HEADER]: key }),
  postSend: (token, key, body) => keyed('POST', `/api/results/${token}/send`, key, body),
  getDeliveries: (token, key) => keyed('GET', `/api/results/${token}/deliveries`, key),
};

// Satu hasil di server per objek File. Reset menaikkan versi: janji yang masih
// berjalan tetap selesai, tetapi hasilnya dibuang dan tidak pernah jadi current().
export function createShareSession({ api = defaultApi, now = Date.now } = {}) {
  let version = 0;
  let entry = null; // { file, promise, result }
  let autoSentFor = null; // File yang sudah dikirim otomatis (hanya File pertama sesi)

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

  // Unggah dulu bila perlu, lalu antrekan. Reset di tengah jalan membatalkan kiriman.
  async function send(channel, to, { file, templateId = null, lang }) {
    const v = version;
    const result = await ensureResult(file, { templateId, lang });
    if (v !== version) throw new Error('Sesi di-reset');
    return api.postSend(result.token, result.key, { channel, to });
  }

  async function deliveries() {
    const mine = entry;
    if (!mine?.result) return [];
    const v = version;
    const list = await api.getDeliveries(mine.result.token, mine.result.key);
    return v === version ? list : [];
  }

  return {
    ensureResult,
    uploadAsset,
    send,
    deliveries,
    claimAutoSend(file) {
      if (autoSentFor) return false;
      autoSentFor = file;
      return true;
    },
    current: () => (entry?.result ? { token: entry.result.token, key: entry.result.key, url: entry.result.url } : null),
    reset() {
      version++;
      entry = null;
      autoSentFor = null;
    },
  };
}
