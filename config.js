import crypto from 'node:crypto';

export const EXAMPLE_SESSION_SECRET = 'ganti-dengan-string-acak-panjang';

function loadMail(env) {
  if (env.MAIL_TRANSPORT === 'json') return { transport: 'json', from: 'photobooth@localhost' };
  const { SMTP_HOST: host, SMTP_PORT: rawPort, SMTP_USER: user, SMTP_PASS: pass } = env;
  if (!host || !rawPort || !user || !pass) return null;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`SMTP_PORT tidak valid: ${rawPort}`);
  return { host, port, user, pass, from: env.SMTP_FROM || user, transport: 'smtp' };
}

function loadWhatsApp(env) {
  const { WA_PHONE_NUMBER_ID: phoneNumberId, WA_ACCESS_TOKEN: token, WA_TEMPLATE_NAME: template, WA_TEMPLATE_LANG: lang } = env;
  if (!phoneNumberId || !token || !template || !lang) return null;
  const apiBase = (env.WA_API_BASE || 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
  return { phoneNumberId, token, template, lang, apiBase };
}

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
    mail: loadMail(env),
    whatsapp: loadWhatsApp(env),
    port,
    dbPath: env.DB_PATH || './data/photobooth.db',
    uploadDir: env.UPLOAD_DIR || './uploads',
    sessionSecret,
    tz,
    nodeEnv,
    isProd,
  };
}
