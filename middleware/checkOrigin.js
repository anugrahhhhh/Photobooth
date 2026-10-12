const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Request yang mengubah data harus membawa Origin dengan host yang sama.
// req.host (Express 5) menyertakan port dan mengikuti `trust proxy`.
export function checkOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  let originHost = null;
  try {
    originHost = new URL(req.get('origin')).host;
  } catch {
    // Origin tidak ada atau tidak valid
  }
  if (!originHost || originHost !== req.host) return res.status(403).json({ error: 'Origin tidak diizinkan' });
  next();
}
