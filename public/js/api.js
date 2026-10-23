export class ApiError extends Error {
  constructor(status, message, retryAfter = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request(method, url, body, { form = false } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    if (form) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi.');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // respons bukan JSON
  }
  if (!res.ok) {
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(res.status, data?.error ?? `Permintaan gagal (${res.status})`, retry > 0 ? retry : null);
  }
  return data;
}

export const getJSON = (url) => request('GET', url);
export const sendJSON = (method, url, body) => request(method, url, body);
export const sendForm = (method, url, formData) => request(method, url, formData, { form: true });

// Body mentah (GIF/video) dengan header tambahan, mis. X-Result-Key.
export async function putRaw(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, { method: 'PUT', credentials: 'same-origin', headers, body });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi.');
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // respons bukan JSON
    }
    throw new ApiError(res.status, data?.error ?? `Permintaan gagal (${res.status})`);
  }
  return null;
}
