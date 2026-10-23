import { HttpError } from './http-error.js';
import { maskEmail, maskPhone } from '../public/js/contact.js';

export const MAX_DELIVERIES_PER_RESULT = 3;
export const MAX_ATTEMPTS = 3;
export const BACKOFF_MS = [30_000, 120_000];
const BATCH = 2;
const SEND_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Pesan galat singkat tanpa kredensial; objek galat tidak pernah disimpan.
function sanitize(err, secrets) {
  let msg = String(err?.message ?? err);
  for (const s of secrets) if (s) msg = msg.split(s).join('***');
  return msg.slice(0, 200);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Pengiriman melewati batas waktu')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createDeliveryQueue({ db, store, senders = {}, now = () => new Date(), secrets = [], sendTimeoutMs = SEND_TIMEOUT_MS }) {
  let timer = null;
  let running = null;

  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE result_id = ?');
  const insertStmt = db.prepare(
    `INSERT INTO deliveries (result_id, channel, recipient, recipient_masked, status, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
  );

  const countFor = (resultId) => countStmt.get(resultId).n;

  // Cek kuota dan sisip dalam satu transaksi agar permintaan serentak tidak melewati batas.
  const insertWithQuota = db.transaction((resultRow, channel, recipient) => {
    if (countFor(resultRow.id) >= MAX_DELIVERIES_PER_RESULT) throw new HttpError(429, 'Batas kiriman untuk hasil ini sudah tercapai');
    const masked = channel === 'email' ? maskEmail(recipient) : maskPhone(recipient);
    const stamp = now().toISOString();
    return Number(insertStmt.run(resultRow.id, channel, recipient, masked, stamp, stamp).lastInsertRowid);
  });

  function enqueue(resultRow, channel, recipient) {
    return insertWithQuota(resultRow, channel, recipient);
  }

  async function deliver(row) {
    const sender = senders[row.channel];
    if (!sender) throw new Error('Layanan pengiriman tidak aktif');
    const pageUrl = `${row.base_url}/p/${row.token}`;
    if (row.channel === 'email') {
      return sender.send({ to: row.recipient, lang: row.lang, pageUrl, photoPath: store.filePath(row.token, 'photo.jpg') });
    }
    return sender.send({ to: row.recipient, photoUrl: `${row.base_url}/r/${row.token}/photo.jpg`, pageUrl });
  }

  async function processRow(row) {
    try {
      await withTimeout(Promise.resolve().then(() => deliver(row)), sendTimeoutMs);
    } catch (err) {
      const attempts = row.attempts + 1;
      const error = sanitize(err, [...secrets, row.recipient]);
      if (attempts >= MAX_ATTEMPTS) {
        db.prepare(`UPDATE deliveries SET status = 'failed', attempts = ?, recipient = NULL, last_error = ? WHERE id = ?`).run(attempts, error, row.id);
      } else {
        const next = new Date(now().getTime() + BACKOFF_MS[attempts - 1]).toISOString();
        db.prepare(`UPDATE deliveries SET status = 'queued', attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`).run(attempts, next, error, row.id);
      }
      return;
    }
    db.prepare(`UPDATE deliveries SET status = 'sent', attempts = ?, recipient = NULL, last_error = NULL, sent_at = ? WHERE id = ?`).run(
      row.attempts + 1,
      now().toISOString(),
      row.id,
    );
  }

  async function runTick() {
    const rows = db
      .prepare(
        `SELECT d.id, d.channel, d.recipient, d.attempts, r.token, r.lang, r.base_url
         FROM deliveries d JOIN results r ON r.id = d.result_id
         WHERE d.status = 'queued' AND d.next_attempt_at <= ?
         ORDER BY d.next_attempt_at, d.id LIMIT ?`,
      )
      .all(now().toISOString(), BATCH);
    if (!rows.length) return;
    const mark = db.prepare(`UPDATE deliveries SET status = 'sending' WHERE id = ?`);
    db.transaction(() => rows.forEach((r) => mark.run(r.id)))();
    await Promise.all(rows.map(processRow));
  }

  // Satu tick pada satu waktu; pemanggil yang tumpang tindih menunggu tick yang berjalan.
  function tick() {
    if (!running) running = runTick().finally(() => (running = null));
    return running;
  }

  function recover() {
    db.prepare(`UPDATE deliveries SET status = 'queued' WHERE status = 'sending'`).run();
  }

  function start(intervalMs = 3000) {
    if (timer) return;
    timer = setInterval(() => tick().catch((err) => console.warn(`Antrean kiriman gagal: ${err.message}`)), intervalMs);
    timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function stats7d() {
    const since = new Date(now().getTime() - 7 * DAY_MS).toISOString();
    const count = (status, col) => db.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE status = ? AND ${col} >= ?`).get(status, since).n;
    return { sent: count('sent', 'sent_at'), failed: count('failed', 'created_at') };
  }

  return { enqueue, countFor, tick, recover, start, stop, stats7d };
}
