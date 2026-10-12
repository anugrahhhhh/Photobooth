import fs from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';

const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Database dan folder uploads selalu dicadangkan bersama.
export async function backup({ db, uploadDir, outRoot = './backups', date = new Date() }) {
  const dir = path.resolve(outRoot, stamp(date));
  await mkdir(dir, { recursive: true });
  await db.backup(path.join(dir, 'photobooth.db'));
  const templates = path.join(path.resolve(uploadDir), 'templates');
  if (fs.existsSync(templates)) await cp(templates, path.join(dir, 'uploads', 'templates'), { recursive: true });
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  try {
    console.log(`Backup tersimpan di ${await backup({ db, uploadDir: config.uploadDir })}`);
  } finally {
    db.close();
  }
}
