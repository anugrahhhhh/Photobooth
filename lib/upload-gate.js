import { HttpError } from './http-error.js';

export const MAX_CONCURRENT_UPLOADS = 3;

// Batas unggahan body mentah yang dibaca serentak (foto, GIF, video) agar memori VM tidak habis.
export function createUploadGate(max = MAX_CONCURRENT_UPLOADS) {
  let active = 0;

  // Middleware: ambil slot sebelum body dibaca, lepas sekali saat respons selesai atau koneksi putus.
  function middleware(req, res, next) {
    if (active >= max) {
      res.set('Retry-After', '5');
      throw new HttpError(503, 'Server sedang sibuk mengunggah. Coba lagi sebentar.');
    }
    active++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--;
    };
    res.once('finish', release);
    res.once('close', release);
    req.once('aborted', release);
    next();
  }

  return {
    middleware,
    get active() {
      return active;
    },
  };
}
