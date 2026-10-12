import crypto from 'node:crypto';

export const EXAMPLE_SESSION_SECRET = 'ganti-dengan-string-acak-panjang';

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT tidak valid: ${env.PORT}`);
  }

  const tz = env.TZ || 'Asia/Jakarta';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new Error(`TZ tidak dikenal: ${tz}`);
  }

  let sessionSecret = env.SESSION_SECRET || '';
  if (isProd) {
    if (!sessionSecret || sessionSecret === EXAMPLE_SESSION_SECRET) {
      throw new Error('SESSION_SECRET wajib diisi dengan nilai acak di produksi');
    }
  } else if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    if (nodeEnv !== 'test') console.warn('SESSION_SECRET kosong; memakai secret acak sementara (sesi hilang saat restart)');
  }

  return {
    port,
    dbPath: env.DB_PATH || './data/photobooth.db',
    uploadDir: env.UPLOAD_DIR || './uploads',
    sessionSecret,
    tz,
    nodeEnv,
    isProd,
  };
}
