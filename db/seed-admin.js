import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { loadConfig } from '../config.js';
import { openDb } from './index.js';

export const BCRYPT_COST = 12;
const MIN_PASSWORD = 8;

export async function seedAdmin(db, { username, password, reset = false }) {
  if (!username) throw new Error('Username wajib diisi');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new Error(`Password minimal ${MIN_PASSWORD} karakter`);
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  if (reset) {
    if (!existing) throw new Error(`User "${username}" tidak ditemukan`);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
  } else {
    if (existing) throw new Error(`User "${username}" sudah ada; pakai --reset untuk mengganti password`);
    db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)").run(
      username,
      hash,
      new Date().toISOString(),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const reset = args[0] === '--reset';
  const [username, password] = reset ? args.slice(1) : args;
  if (!username || !password) {
    console.error('Pemakaian: node db/seed-admin.js [--reset] <user> <pass>');
    process.exit(1);
  }
  const db = openDb(loadConfig().dbPath);
  try {
    await seedAdmin(db, { username, password, reset });
    console.log(reset ? `Password "${username}" diganti.` : `Admin "${username}" dibuat.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
