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

// URL publik untuk tautan keluar (QR, email, WhatsApp). Hanya origin http(s), tanpa path.
function loadPublicUrl(env) {
  const raw = (env.PUBLIC_URL || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_URL tidak valid: ${raw}`);
  }
  const ok = (url.protocol === 'http:' || url.protocol === 'https:') && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  if (!ok) throw new Error(`PUBLIC_URL harus berupa http(s)://host tanpa path: ${raw}`);
  return url.origin;
}

function loadMaxDeliveriesPerDay(env) {
  const raw = env.MAX_DELIVERIES_PER_DAY;
  if (raw === undefined || raw === '') return 400;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`MAX_DELIVERIES_PER_DAY tidak valid: ${raw}`);
  return n;
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

  const mail = loadMail(env);
  const whatsapp = loadWhatsApp(env);
  const publicUrl = loadPublicUrl(env);
  if (isProd && (mail || whatsapp) && !publicUrl) {
    throw new Error('PUBLIC_URL wajib diisi di produksi bila email atau WhatsApp diaktifkan');
  }

  return {
    mail,
    whatsapp,
    publicUrl,
    maxDeliveriesPerDay: loadMaxDeliveriesPerDay(env),
    port,
    dbPath: env.DB_PATH || './data/photobooth.db',
    uploadDir: env.UPLOAD_DIR || './uploads',
    sessionSecret,
    tz,
    nodeEnv,
    isProd,
  };
}
