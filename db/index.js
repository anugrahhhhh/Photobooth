import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const SETTINGS_SCHEMA = {
  countdown_seconds: { min: 1, max: 10, default: 3 },
  mirror_output: { min: 0, max: 1, default: 0 },
  kiosk_idle_seconds: { min: 30, max: 600, default: 90 },
  review_seconds: { min: 0, max: 10, default: 3 },
  sound_default: { min: 0, max: 1, default: 1 },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  image_path  TEXT NOT NULL,
  thumb_path  TEXT NOT NULL,
  canvas_w    INTEGER NOT NULL,
  canvas_h    INTEGER NOT NULL,
  slots_json  TEXT NOT NULL,
  photo_count INTEGER NOT NULL,
  bg_color    TEXT NOT NULL DEFAULT '#ffffff',
  status      TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_logs (
  id          INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES templates(id),
  photo_count INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_logs_created_at ON session_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_session_logs_template_id ON session_logs(template_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) insert.run(key, String(def.default));
  return db;
}

export function getSettings(db) {
  const out = {};
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) out[key] = def.default;
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    if (Object.hasOwn(SETTINGS_SCHEMA, key)) out[key] = Number(value);
  }
  return out;
}
