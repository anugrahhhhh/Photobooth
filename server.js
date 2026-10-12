import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import helmet from 'helmet';
import multer from 'multer';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createStorage } from './storage/index.js';
import { HttpError } from './lib/http-error.js';
import { authRouter } from './routes/auth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { checkOrigin } from './middleware/checkOrigin.js';

const SqliteStore = SqliteStoreFactory(session);

// Store bawaan selalu memasang interval tanpa unref (opsi expired.clear diabaikan),
// sehingga proses tidak bisa keluar. Interval di sini di-unref dan dimatikan saat tes.
class SessionStore extends SqliteStore {
  constructor({ runCleanup, ...options }) {
    super(options);
    if (runCleanup) setInterval(() => this.clearExpiredSessions(), 15 * 60_000).unref();
  }

  // Dipanggil oleh konstruktor induk; interval dipasang sendiri di atas.
  startInterval() {}
}

const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const UPLOAD_FILE_RE = /^\/[^/]+\.(png|jpg)$/;
const SESSION_MAX_AGE = 12 * 60 * 60_000;

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

export function createApp({ config, db, storage, now = () => new Date(), extraRoutes }) {
  const app = express();
  app.locals.now = now;

  if (config.isProd) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
    }),
  );
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(self), fullscreen=(self)');
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.use(
    '/uploads/templates',
    (req, res, next) => (UPLOAD_FILE_RE.test(req.path) ? next() : next(new HttpError(404, 'Tidak ditemukan'))),
    express.static(path.join(path.resolve(config.uploadDir), 'templates'), {
      index: false,
      redirect: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '1y',
      fallthrough: false,
    }),
  );
  app.use(express.static(PUBLIC_DIR));

  app.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  app.use(
    session({
      name: 'pb.sid',
      secret: config.sessionSecret,
      store: new SessionStore({ client: db, runCleanup: config.nodeEnv !== 'test' }),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: SESSION_MAX_AGE },
    }),
  );

  app.use('/api/auth', noStore, checkOrigin, authRouter({ db }));
  app.use('/api/admin', noStore, checkOrigin, requireAdmin);

  extraRoutes?.(app);

  app.use('/api', (req, res, next) => next(new HttpError(404, 'Tidak ditemukan')));
  app.use(errorHandler);
  return app;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const [status, message] = classify(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
}

function classify(err) {
  if (err instanceof HttpError) return [err.status, err.message];
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE' ? [413, 'File terlalu besar'] : [400, 'Unggahan tidak valid'];
  }
  if (err.type === 'entity.parse.failed') return [400, 'Body JSON tidak valid'];
  if (err.type === 'entity.too.large') return [413, 'Body terlalu besar'];
  if (err.status === 404 || err.statusCode === 404) return [404, 'Tidak ditemukan'];
  return [500, 'Terjadi kesalahan pada server'];
}

function start() {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const storage = createStorage(config.uploadDir);
  const app = createApp({ config, db, storage });
  const server = app.listen(config.port, () => console.log(`Photobooth berjalan di http://localhost:${config.port}`));

  const shutdown = (signal) => {
    console.log(`${signal} diterima, menutup server...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
