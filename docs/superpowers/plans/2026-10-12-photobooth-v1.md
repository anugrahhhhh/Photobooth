# Photobooth v1 — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun photobooth berbasis browser sesuai spec: server Express + SQLite untuk template, pengaturan, dan log sesi; halaman admin untuk mengelola template; dan alur pengguna satu halaman (kamera → atur → unduh) yang tidak pernah mengirim foto ke server.

**Architecture:** `server.js` mengekspor `createApp({ config, db, storage, now })` sehingga tes membangun app dengan SQLite `:memory:` dan folder upload sementara; server hanya `listen` bila dijalankan langsung. Modul murni di `public/js/` (slots, geometry, filters, detect-slots) diimpor oleh server dan tes Node. Frontend vanilla ES modules tanpa build.

**Tech Stack:** Node.js 24 (ESM), Express 5, better-sqlite3, better-sqlite3-session-store, express-session, multer 2, bcrypt, express-rate-limit, helmet; tes `node:test` + `supertest`.

**Spec:** `docs/superpowers/specs/2026-10-12-photobooth-design.md`. Baca spec lengkap sebelum tiap tahap; nomor bagian (§) di rencana ini merujuk ke spec.

## Global Constraints

- `"type": "module"` di seluruh proyek; Node ≥ 22.9 (dipakai `--env-file-if-exists`, `zlib.crc32`). Lokal: Node 24.13.
- Semua error API berbentuk `{ "error": "pesan" }`; pesan berbahasa Indonesia. Semua teks UI berbahasa Indonesia.
- Waktu disimpan sebagai string ISO 8601 UTC (`new Date().toISOString()`).
- Respons API tidak pernah memuat `image_path`/`thumb_path`; hanya `image_url`/`thumb_url` dari `storage.urlFor`.
- Kanvas: sisi 1–4000 px, `w × h ≤ 12_000_000`. Slot 1–8, bilangan bulat, `w,h > 0`, di dalam kanvas. PNG ≤ 5 MB. Thumbnail JPEG sisi ≤ 600 px, ≤ 300 KB.
- Rate limit: login 5 / 15 menit / IP; `POST /api/sessions` `SESSION_LOG_LIMIT = 120` / 10 menit / IP.
- Pengaturan whitelist: `countdown_seconds` int 1–10 (default 3), `mirror_output` 0|1 (default 0).
- Foto pengguna tidak pernah dikirim ke server.
- Frontend admin tidak pernah memakai `innerHTML` dengan data server; hanya `textContent`/`createElement`.
- Tidak ada skrip inline (CSP `default-src 'self'`): semua JS lewat `<script type="module" src>`.
- Foto: sisi terpanjang maksimal 1920 px. Salinan filter di layar Atur: 1024 px. Zoom 1–3.
- Git: kerja di `feat/photobooth-v1`, **satu commit per tahap** (bukan per task), berhenti di akhir tiap tahap untuk diperiksa. Merge ke `main` hanya setelah tahap disetujui.

## Keputusan yang mengisi celah spec (disetujui 2026-10-12)

Butir 1–3 sudah dimasukkan ke spec (§3 dan §16).

1. **Tambahan di luar struktur §3:** folder `test/` (tes + `test/helpers.js`), `lib/http-error.js` (kelas `HttpError(status, message)`), dan `createApp` diekspor dari `server.js`.
2. **Thumbnail digabung ke Tahap 2.** API (§7) mewajibkan `thumb` pada POST, jadi form admin di Tahap 2 tidak bisa menyimpan tanpa thumbnail buatan browser. Pembuatan thumbnail (§13 langkah 6) dipindah ke Task 2.8; "Tahap 4" menjadi tahap "kalau sempat".
3. **`geometry.js` dan `strip.js` dibangun di Tahap 2** karena pratinjau admin (§13 langkah 5) memakai `strip.js`.
4. **Kode status:** thumbnail > 300 KB → 413 (sejalan dengan `LIMIT_FILE_SIZE`); dimensi thumbnail > 600 atau dimensi PNG ≠ kanvas → 422; `POST /api/sessions` dengan template tidak ada/tidak aktif → 422; nilai pengaturan di luar rentang → 422 (kunci tak dikenal tetap 400).
5. **Validasi tambahan:** `name` di-trim, 1–100 karakter; `bg_color` harus `#rrggbb`; password admin minimal 8 karakter di `seed-admin.js`.
6. **Login:** `req.session.regenerate` setelah login berhasil (mencegah session fixation); `checkOrigin` juga berlaku untuk `POST /api/auth/login` dan `/logout`.
7. **PUT** selalu menerima `name`, `slots`, `bg_color` lengkap (form admin selalu mengirim semuanya); `canvas_w/h` wajib hanya jika `image` dikirim. Halaman edit mengambil data dari `GET /api/admin/templates` (tanpa endpoint detail admin baru).
8. **Thumbnail `seed-sample.js`** adalah file sungguhan `test/fixtures/thumb.jpg` (267×400, bingkai template contoh dengan slot abu-abu), dibuat sekali dengan Pillow lalu di-commit, karena Node tidak punya encoder JPEG.
9. **Deteksi slot:** jika hasil 0 atau > 8, daftar slot tidak diubah dan peringatan ditampilkan.

## Review Focus

1. **Input slot dari multipart berupa string** — `slots` adalah teks JSON; JSON rusak, angka sebagai string (`"100"`), atau pecahan (`10.5`) harus 422 dengan pesan jelas, bukan 500. Tes di Task 2.2.
2. **Unggahan ditolak di tengah jalan** — saat multer gagal (413, field tak dikenal) atau validasi gagal, folder `uploads/tmp` harus kosong lagi. Tes di Task 2.2.
3. **Body login bukan string** — `{ "username": ["a"], "password": {} }` atau body kosong harus 401 umum, bukan 500 dari bcrypt. Tes di Task 1.6.
4. **Ganti kamera memicu `onended` track lama** — `stop()` yang disengaja tidak boleh dihitung sebagai stream mati dan memicu restart. Handler dilepas sebelum track dihentikan. Kasus manual di Task 3.8, tes `restartPolicy` di Task 3.2.
5. **CSP `upgrade-insecure-requests` di HTTP lokal** — default helmet menambahkan direktif ini; di `http://localhost` atau LAN, Safari bisa mengubah request aset ke HTTPS dan gagal. Hanya aktif di produksi. Tes di Task 1.5.
6. **Urutan field multipart** — multer memproses field sesuai urutan kiriman browser; validasi (`canvas_w/h`, slot, dimensi file) dilakukan di handler setelah semua field dan file diterima, tidak pernah di `fileFilter` atau berdasarkan field yang kebetulan sudah tiba. Tes di Task 2.2: file dikirim sebelum dan sesudah field teks, hasilnya sama.
7. **Atribut `on*` dan skrip inline di HTML** — helmet memakai `script-src-attr 'none'` dan `script-src 'self'`, jadi `onclick="..."` atau `<script>` tanpa `src` diam-diam tidak jalan. Tes di Task 1.5 memindai semua `public/**/*.html` dan gagal bila ada atribut `on*=` atau `<script>` tanpa `src`; tes ini terus menjaga halaman yang dibuat di Tahap 2 dan 3.

---

# TAHAP 1 — Fondasi server dan keamanan

### Task 1.1: Scaffold proyek dan `config.js`

**Files:**
- Create: `package.json`, `.env.example`, `README.md`, `config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env = process.env) -> { port: number, dbPath: string, uploadDir: string, sessionSecret: string, tz: string, nodeEnv: string, isProd: boolean }`; konstanta `EXAMPLE_SESSION_SECRET = 'ganti-dengan-string-acak-panjang'`. Melempar `Error` saat gagal.

- [ ] **Step 1: Buat `package.json`** dengan `"type": "module"`, `"engines": { "node": ">=22.9" }`, dan skrip:
  - `start`: `node --env-file-if-exists=.env server.js`
  - `dev`: `node --watch --env-file-if-exists=.env server.js`
  - `test`: `node --test`
  - `seed:admin`: `node --env-file-if-exists=.env db/seed-admin.js`
  - `seed:sample`: `node --env-file-if-exists=.env db/seed-sample.js`
  - `backup`: `node --env-file-if-exists=.env scripts/backup.js`

  Lalu `npm i express@5 better-sqlite3 better-sqlite3-session-store express-session multer@2 bcrypt express-rate-limit helmet` dan `npm i -D supertest`.

- [ ] **Step 2: Buat `.env.example`** berisi keenam env §4 dengan default-nya, dan `SESSION_SECRET=ganti-dengan-string-acak-panjang`.

- [ ] **Step 3: Tulis tes yang gagal**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, EXAMPLE_SESSION_SECRET } from '../config.js';

test('default development', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.dbPath, './data/photobooth.db');
  assert.equal(c.uploadDir, './uploads');
  assert.equal(c.tz, 'Asia/Jakarta');
  assert.equal(c.isProd, false);
  assert.ok(c.sessionSecret.length > 0); // secret dev otomatis
});
test('produksi tanpa SESSION_SECRET ditolak', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/);
});
test('produksi dengan secret contoh ditolak', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: EXAMPLE_SESSION_SECRET }), /SESSION_SECRET/);
});
test('produksi dengan secret asli diterima', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }).isProd, true);
});
test('PORT bukan angka ditolak', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
});
test('TZ tidak dikenal ditolak', () => {
  assert.throws(() => loadConfig({ TZ: 'Mars/Olympus' }), /TZ/);
});
```

- [ ] **Step 4: Jalankan** `npm test` — Expected: FAIL (modul `config.js` belum ada).
- [ ] **Step 5: Implementasikan `loadConfig`.** Validasi TZ lewat `new Intl.DateTimeFormat('en', { timeZone })` dalam try/catch. Di development tanpa secret: `crypto.randomBytes(32).toString('hex')` plus `console.warn`.
- [ ] **Step 6: Jalankan** `npm test` — Expected: PASS.
- [ ] **Step 7: Buat `README.md` kerangka** dengan bagian kosong untuk: Env, Menjalankan, Seed, Backup, Deploy, Catatan kamera. Diisi di tugas-tugas berikutnya.

### Task 1.2: `lib/time.js` dan `lib/image-header.js`

**Files:**
- Create: `lib/time.js`, `lib/image-header.js`
- Test: `test/time.test.js`, `test/image-header.test.js`

**Interfaces:**
- Produces:
  - `dayBoundsUTC(now: Date, tz: string) -> { start: string, end: string }` (ISO UTC; `end` = awal hari berikutnya)
  - `isPng(buf) -> boolean`, `readPngSize(buf) -> { width, height } | null`
  - `isJpeg(buf) -> boolean`, `readJpegSize(buf) -> { width, height } | null`

- [ ] **Step 1: Tulis tes yang gagal**

```js
// test/time.test.js
test('Jakarta: lewat tengah malam lokal', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-10-12T18:30:00Z'), 'Asia/Jakarta'),
    { start: '2026-10-12T17:00:00.000Z', end: '2026-10-13T17:00:00.000Z' });
});
test('Jakarta: satu detik sebelum tengah malam lokal', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-10-12T16:59:59Z'), 'Asia/Jakarta'),
    { start: '2026-10-11T17:00:00.000Z', end: '2026-10-12T17:00:00.000Z' });
});
test('zona dengan DST: hari 23 jam', () => {
  assert.deepEqual(dayBoundsUTC(new Date('2026-03-08T12:00:00Z'), 'America/New_York'),
    { start: '2026-03-08T05:00:00.000Z', end: '2026-03-09T04:00:00.000Z' });
});
```

```js
// test/image-header.test.js — buffer dibuat oleh helper di test/helpers.js (Task 1.7)
// sementara cukup susun byte secara manual di tes ini.
test('PNG valid → ukuran dari IHDR', () => assert.deepEqual(readPngSize(png(1200, 1800)), { width: 1200, height: 1800 }));
test('PNG tanda tangan salah → null, isPng false');
test('PNG terpotong (< 24 byte) → null');
test('JPEG baseline SOF0 setelah APP0 → ukuran', () => assert.deepEqual(readJpegSize(jpeg(400, 300, 0xC0)), { width: 400, height: 300 }));
test('JPEG progresif SOF2 → ukuran');
test('JPEG dengan marker DHT (C4) sebelum SOF tidak salah dibaca sebagai SOF');
test('JPEG tanpa SOF / terpotong → null');
test('isJpeg butuh FF D8 FF');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan `dayBoundsUTC`.** Algoritma:

```js
// offset(utcMs) = (waktu dinding di tz, dibaca lewat Intl formatToParts sebagai Date.UTC) - utcMs
// tengah malam lokal untuk (y, m, d):
//   guess = Date.UTC(y, m-1, d); t = guess - offset(guess); t = guess - offset(t);
// start = tengah malam lokal untuk tanggal lokal 'now'; end = tengah malam lokal untuk tanggal+1
```

  Pakai `hourCycle: 'h23'` agar jam 24 tidak muncul.
- [ ] **Step 4: Implementasikan header reader.** PNG: 8 byte tanda tangan, lalu `IHDR` di offset 12, lebar/tinggi `readUInt32BE(16/20)`. JPEG: mulai offset 2, telusuri segmen (`FF xx` + panjang 2 byte); SOF adalah `C0–CF` kecuali `C4`, `C8`, `CC`; tinggi di offset +5, lebar di +7 dari marker; berhenti di `DA` (SOS) atau akhir buffer → `null`.
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS.

### Task 1.3: Database dan `seed-admin.js`

**Files:**
- Create: `db/index.js`, `db/seed-admin.js`
- Test: `test/db.test.js`

**Interfaces:**
- Produces:
  - `openDb(path: string) -> Database` (better-sqlite3; pragma + migrasi sudah jalan)
  - `getSettings(db) -> { countdown_seconds: number, mirror_output: number }`
  - `SETTINGS_SCHEMA = { countdown_seconds: { min: 1, max: 10, default: 3 }, mirror_output: { min: 0, max: 1, default: 0 } }`
  - `seedAdmin(db, { username, password, reset = false }) -> Promise<void>` (melempar Error jika user sudah ada tanpa `reset`, belum ada dengan `reset`, atau password < 8)

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('pragma foreign_keys aktif', () => assert.equal(openDb(':memory:').pragma('foreign_keys', { simple: true }), 1));
test('migrasi idempotent: openDb dua kali pada file yang sama tidak error'); // file di os.tmpdir()
test('default settings terisi', () => assert.deepEqual(getSettings(openDb(':memory:')), { countdown_seconds: 3, mirror_output: 0 }));
test('status template di luar enum ditolak CHECK');
test('session_logs dengan template_id tak ada ditolak FK');
test('indeks session_logs(created_at) dan (template_id) ada'); // cek sqlite_master
test('seedAdmin membuat user dengan hash bcrypt, role admin');
test('seedAdmin user sudah ada tanpa reset → throw; dengan reset → hash berubah');
test('seedAdmin password < 8 karakter → throw');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan `openDb`.** Pragma `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`. Buat folder induk `dbPath` bila belum ada (kecuali `:memory:`). Tabel sesuai §5 dengan `CREATE TABLE IF NOT EXISTS`, `CHECK (status IN ('active','inactive','archived'))`, `CHECK (role = 'admin')`, `session_logs.template_id INTEGER NOT NULL REFERENCES templates(id)`, dua indeks, lalu `INSERT OR IGNORE` default settings. Tabel `sessions` dibuat oleh session store, bukan di sini.
- [ ] **Step 4: Implementasikan `seedAdmin`** (bcrypt cost 12) dan CLI di file yang sama: `node db/seed-admin.js [--reset] <user> <pass>` memakai `loadConfig().dbPath`, mencetak pesan sukses atau error lalu `process.exit(1)`. CLI hanya jalan bila file dieksekusi langsung (bandingkan `import.meta.url` dengan `pathToFileURL(process.argv[1]).href`).
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS.

### Task 1.4: `storage/index.js`

**Files:**
- Create: `storage/index.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Produces: `createStorage(uploadDir: string) -> { tmpDir: string, save(src: Buffer | string, ext: 'png' | 'jpg') -> Promise<string>, remove(key: string) -> Promise<void>, urlFor(key: string) -> string, savePair(image, thumb) -> Promise<{ imageKey, thumbKey }> }`. Key berbentuk `templates/<uuid>.<ext>`; `urlFor` → `/uploads/templates/<uuid>.<ext>`. `tmpDir` = `<uploadDir>/tmp` (tujuan multer, satu filesystem dengan `templates/` sehingga `rename` aman). Kedua folder dibuat saat `createStorage`.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('save Buffer → file ada, key acak berformat templates/<uuid>.png');
test('save dari path tmp → file dipindah (tmp hilang, tujuan ada)');
test('dua save menghasilkan key berbeda');
test('urlFor', () => assert.match(s.urlFor('templates/abc.png'), /^\/uploads\/templates\/abc\.png$/));
test('remove key tak ada tidak melempar');
test('remove menolak key yang keluar folder (../x)'); // throw, file di luar tidak tersentuh
test('savePair gagal di thumb → image yang sudah tersimpan dihapus, templates/ kosong', async () => {
  await assert.rejects(s.savePair(pngBuf, path.join(dir, 'tidak-ada.jpg')));
  assert.deepEqual(await readdir(path.join(dir, 'templates')), []);
});
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan.** `crypto.randomUUID()`; Buffer → `writeFile`, string → `rename`. `remove` memakai `rm(..., { force: true })` setelah memastikan path hasil resolve berada di dalam `<uploadDir>/templates`.
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 1.5: `server.js` — app, header, static, error handler, shutdown

**Files:**
- Create: `server.js`, `lib/http-error.js`
- Test: `test/server.test.js`, `test/helpers.js`

**Interfaces:**
- Consumes: `loadConfig`, `openDb`, `createStorage`.
- Produces:
  - `createApp({ config, db, storage, now = () => new Date() }) -> express.Application`
  - `class HttpError extends Error { constructor(status: number, message: string) }`
  - `test/helpers.js`: `makeTestApp(opts?) -> Promise<{ app, db, storage, uploadDir, cleanup() }>` (DB `:memory:`, `uploadDir` di `os.tmpdir()`, `config` dari `loadConfig({ NODE_ENV: 'test' })` plus override); `HOST = 'booth.test'`, `ORIGIN = 'http://booth.test'`; `mutate(req)` menyetel header `Host` dan `Origin` tersebut.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('GET /healthz → 200 { ok: true }');
test('CSP: default-src self; img-src dan media-src mengizinkan blob: data:');
test('dev: CSP tanpa upgrade-insecure-requests; produksi: ada'); // Review Focus 5
test('Permissions-Policy: camera=(self), fullscreen=(self)');
test('/uploads/templates/<file>.png tersaji dengan Cache-Control public, max-age=31536000, immutable');
test('/uploads/templates/x.txt → 404, /uploads/templates/ → 404 (tanpa daftar isi)');
test('/uploads/tmp/<file> → 404');
test('route yang melempar Error biasa → 500 { error: pesan umum }, tanpa stack');
test('route yang melempar HttpError(422, "x") → 422 { error: "x" }');
test('/api/tidak-ada → 404 JSON');
```

```js
// test/html-csp.test.js — Review Focus 7
test('tidak ada atribut on* di public/**/*.html', () => {
  for (const [file, html] of htmlFiles()) assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i, file);
});
test('setiap <script> di public/**/*.html memakai src', () => {
  for (const [file, html] of htmlFiles()) assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, file);
});
```

  `htmlFiles()` membaca semua `.html` di bawah `public/` secara rekursif (`fs.readdirSync(..., { recursive: true })`); folder belum ada → daftar kosong.

  Route uji untuk dua tes error dipasang lewat opsi `createApp({ ..., extraRoutes(app) })` yang hanya dipakai tes.
- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan `createApp`.** Urutan: `trust proxy` (hanya `isProd`) → helmet (CSP sesuai §9; `upgradeInsecureRequests: null` bila bukan produksi) → header `Permissions-Policy` → `express.json({ limit: '10kb' })` → session (Task 1.6) → `/uploads/templates` (filter ekstensi `.png`/`.jpg` → selainnya 404; `express.static` dengan `index: false`, `redirect: false`, `immutable: true`, `maxAge: '1y'`) → static `public/` → `/healthz` → routes → 404 JSON untuk `/api/*` → error handler. Error handler: `HttpError` → status-nya; `MulterError` `LIMIT_FILE_SIZE` → 413, kode multer lain → 400; selainnya `console.error` + 500 "Terjadi kesalahan pada server".
- [ ] **Step 4: Tambahkan `start()`** yang jalan bila `server.js` dieksekusi langsung: `loadConfig` → `openDb` → `createStorage` → `listen(port)`. Saat SIGTERM/SIGINT: `server.close(() => { db.close(); process.exit(0); })`.
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS. Lalu `npm start` dan buka `http://localhost:3000/healthz` — Expected: `{"ok":true}`.

### Task 1.6: Session, auth, `requireAdmin`, `checkOrigin`

**Files:**
- Create: `routes/auth.js`, `middleware/requireAdmin.js`, `middleware/checkOrigin.js`
- Modify: `server.js` (session + mount)
- Test: `test/auth.test.js`; tambah `loginAgent(app, db)` ke `test/helpers.js`

**Interfaces:**
- Produces:
  - `requireAdmin(req, res, next)`: 401 `{ error: 'Silakan login' }` jika `req.session.userId` kosong.
  - `checkOrigin(req, res, next)`: untuk POST/PUT/PATCH/DELETE, `new URL(req.get('origin')).host === req.host` (Express 5: menyertakan port dan menghormati `trust proxy`); jika `Origin` tidak ada, tidak valid, atau beda → 403.
  - `authRouter({ db }) -> Router` dipasang di `/api/auth`.
  - Prefix `/api/auth` dan `/api/admin` mendapat `Cache-Control: no-store`, dan `checkOrigin`; `/api/admin` juga `requireAdmin`.
  - `loginAgent(app, db) -> Promise<supertest.Agent>`: membuat admin `admin`/`password123` lewat `seedAdmin`, login, mengembalikan agent.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('login benar → 200, /me → 200 { username: "admin" }');
test('password salah dan username tak ada → 401 dengan pesan yang sama persis');
test('body login bukan string atau kosong → 401, bukan 500'); // Review Focus 3
test('percobaan ke-6 dalam 15 menit → 429 dengan header Retry-After > 0');
test('/me tanpa login → 401');
test('logout → /me berikutnya 401');
test('POST /api/auth/login tanpa Origin → 403; Origin http://evil.test → 403');
test('/api/auth/me memakai Cache-Control: no-store');
test('cookie sesi HttpOnly dan SameSite=Lax');
test('GET /api/admin/templates tanpa login → 401');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Pasang session** di `createApp`: store `better-sqlite3-session-store` dengan `client: db` dan `expired: { clear: config.nodeEnv !== 'test', intervalMs: 15 * 60_000 }` (interval mati di tes agar proses tes bisa selesai); cookie `httpOnly`, `sameSite: 'lax'`, `secure: config.isProd`, `maxAge` 12 jam; `resave: false`, `saveUninitialized: false`.
- [ ] **Step 4: Implementasikan login.** Rate limiter dibuat di dalam `authRouter` (instance baru per app, agar tes terisolasi): `rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' } })`. Username/password bukan string → perlakukan sebagai gagal. Username tak ditemukan → `bcrypt.compare(password, DUMMY_HASH)` (hash dibuat sekali saat modul dimuat). Gagal → 401 `{ error: 'Username atau password salah' }`. Berhasil → `req.session.regenerate`, set `userId`, 200 `{ username }`.
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS.

### Task 1.7: `seed-sample.js`, `scripts/backup.js`, commit Tahap 1

**Files:**
- Create: `db/seed-sample.js`, `scripts/backup.js`, `test/fixtures/thumb.jpg`
- Modify: `test/helpers.js`, `test/image-header.test.js` (pakai helper), `README.md`
- Test: `test/seed-sample.test.js`, `test/backup.test.js`

**Interfaces:**
- Produces:
  - `encodePng(width, height, pixel: (x, y) => [r, g, b, a]) -> Buffer` (RGBA 8-bit, filter 0 per baris, `zlib.deflateSync`, CRC lewat `zlib.crc32`)
  - `SAMPLE_TEMPLATE = { name: 'Contoh 3 foto', canvas_w: 1200, canvas_h: 1800, bg_color: '#ffffff', slots: [{x:100,y:100,w:1000,h:480},{x:100,y:640,w:1000,h:480},{x:100,y:1180,w:1000,h:480}] }`
  - `buildSamplePng(tpl = SAMPLE_TEMPLATE) -> Buffer` (bingkai `#f4c2c2` opak, alpha 0 di dalam slot)
  - `SAMPLE_THUMB_PATH` = path absolut ke `test/fixtures/thumb.jpg` (JPEG 267×400)
  - `insertSample(db, storage, { status = 'active' } = {}) -> Promise<number>` (id template)
  - `test/helpers.js`: `fakeJpeg(width, height, { sof = 0xC0, size } = {}) -> Buffer` (header JPEG minimal dengan APP0 + SOF, diisi nol hingga `size`)
  - `backup({ db, uploadDir, outRoot = './backups', date = new Date() }) -> Promise<string>` (folder hasil `backups/<YYYY-MM-DD-HHmmss>/` berisi `photobooth.db` dan `uploads/templates/`)

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('buildSamplePng terbaca 1200x1800 oleh readPngSize dan < 5 MB');
test('test/fixtures/thumb.jpg terbaca 267x400 oleh readJpegSize dan ≤ 300 KB');
test('insertSample menyimpan template aktif dengan photo_count 3 dan dua file ada di storage');
test('backup menyalin DB (bisa dibuka, tabel templates ada) dan semua file template');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan** `seed-sample.js` (CLI: `npm run seed:sample` memasukkan satu template aktif) dan `backup.js` (`db.backup(path)` lalu `fs.cp(..., { recursive: true })`; CLI memakai `loadConfig`). `insertSample` menyalin `SAMPLE_THUMB_PATH` ke storage (lewat Buffer, bukan `rename`, supaya fixture tidak berpindah). Fixture dibuat sekali dengan skrip Pillow di scratchpad (bingkai `#f4c2c2`, slot `#9e9e9e`, skala 400/1800) dan di-commit.
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS, semua tes Tahap 1 hijau.
- [ ] **Step 5: Lengkapi README** bagian Env, Menjalankan, Seed, Backup (DB dan uploads selalu bersama).
- [ ] **Step 6: Cek manual.** `npm run seed:admin -- admin rahasia123`, `npm start`, lalu dari terminal `curl -i -X POST -H "Origin: http://localhost:3000" -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"rahasia123\"}" http://localhost:3000/api/auth/login` — Expected: 200 dan `Set-Cookie`.
- [ ] **Step 7: Commit Tahap 1 dan berhenti untuk diperiksa**

```bash
git add -A
git commit -m "feat: server foundation (config, db, storage, auth, security headers)"
```

---

# TAHAP 2 — Admin CRUD template, pengaturan, dan thumbnail

### Task 2.1: `public/js/slots.js` (validasi bersama)

**Files:**
- Create: `public/js/slots.js`
- Test: `test/slots.test.js`

**Interfaces:**
- Produces: `MAX_SIDE = 4000`, `MAX_PIXELS = 12_000_000`, `MAX_SLOTS = 8`;
  `validateCanvas(w, h) -> string[]`;
  `validateSlots(slots: unknown, w, h) -> { errors: string[], slotErrors: number[], overlaps: [number, number][] }` (`errors` kosong = boleh disimpan; `overlaps` hanya peringatan).

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('kanvas 4000x3000 valid; 4001x10 error; 0x10 error; 4000x3001 (>12 jt) error');
test('kanvas bukan bilangan bulat (10.5) error');
test('0 slot error; 9 slot error; 8 slot valid');
test('slot keluar kanvas → error dan index-nya di slotErrors', () => {
  const r = validateSlots([{ x: 0, y: 0, w: 10, h: 10 }, { x: 95, y: 0, w: 10, h: 10 }], 100, 100);
  assert.deepEqual(r.slotErrors, [1]);
});
test('w atau h = 0 error; nilai string "10" error; pecahan error; x negatif error');
test('slots bukan array → error, tidak melempar');
test('tumpang tindih → overlaps [[0,1]], errors kosong');
test('bersentuhan tepi (x:0,w:10 dan x:10) bukan tumpang tindih');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan** dengan `Number.isInteger`. Pesan error Indonesia dengan nomor slot berbasis 1 ("Slot 2 keluar dari kanvas").
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 2.2: Pipeline unggahan + `POST` dan `GET /api/admin/templates`

**Files:**
- Create: `routes/templates.js`, `lib/template-input.js`
- Modify: `server.js` (mount)
- Test: `test/templates-create.test.js`

**Interfaces:**
- Consumes: `validateCanvas`, `validateSlots`, `readPngSize`, `readJpegSize`, `isPng`, `isJpeg`, `storage`, `HttpError`.
- Produces:
  - `upload` = multer `diskStorage` ke `storage.tmpDir`, `limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 10 }`, `fields([{ name: 'image', maxCount: 1 }, { name: 'thumb', maxCount: 1 }])`.
  - Middleware `cleanupTmp`: pada `res.on('close')`, hapus setiap `req.files[*][*].path` yang masih ada (file yang sudah dipindah `storage.save` sudah tidak ada).
  - `parseTemplateFields(body, { requireCanvas }) -> { name, bg_color, slots, canvas_w?, canvas_h? }` (melempar `HttpError(422)`).
  - `checkImageFile(file) -> Promise<{ width, height }>` (400 jika bukan PNG), `checkThumbFile(file) -> Promise<void>` (400 bukan JPEG, 413 > 300 KB, 422 sisi > 600).
  - `toAdminJson(row, usageCount)` dan `toPublicJson(row)` di `routes/templates.js`. Publik: `id, name, image_url, thumb_url, canvas_w, canvas_h, slots, bg_color`. Admin: publik + `status, photo_count, usage_count, created_at, updated_at`.
  - `POST /api/admin/templates` → 201 objek admin.

- [ ] **Step 1: Tulis tes yang gagal** (PNG dari `encodePng`, thumbnail dari `fakeJpeg`)

```js
test('POST valid → 201, status inactive, photo_count = jumlah slot, tanpa image_path/thumb_path');
test('tanpa thumb → 422; tanpa image → 422');
test('image bukan PNG (tanda tangan) → 400; thumb bukan JPEG → 400');
test('PNG > 5 MB → 413');
test('thumb > 300 KB → 413; thumb 601x10 → 422');
test('dimensi PNG ≠ canvas_w/canvas_h → 422');
test('slots JSON rusak / "100" sebagai string / 10.5 → 422'); // Review Focus 1
test('slot keluar kanvas → 422; slot tumpang tindih → 201');
test('bg_color "red" → 422; name kosong setelah trim → 422');
test('field file tak dikenal → 400');
test('urutan multipart: image/thumb sebelum field teks dan sesudahnya → keduanya 201'); // Review Focus 6
test('setiap kegagalan di atas meninggalkan uploads/tmp kosong'); // Review Focus 2
test('GET /api/admin/templates → semua status dengan usage_count');
test('tanpa Origin → 403 dan tidak ada file tersimpan');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan.** Semua validasi di handler setelah multer selesai (tanpa `fileFilter`). Urutan route: `cleanupTmp` → `upload` → parse field → cek file → `validateCanvas` + `validateSlots` → `storage.savePair(image.path, thumb.path)` → `INSERT` (jika gagal: `remove` kedua key, lempar ulang) → 201. Urutan pemasangan middleware: `checkOrigin` sebelum multer, agar request lintas origin tidak sempat menulis file.
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 2.3: `PUT`, `PATCH status`, `DELETE`

**Files:**
- Modify: `routes/templates.js`
- Test: `test/templates-update.test.js`

**Interfaces:**
- Produces: `PUT /api/admin/templates/:id` → 200 objek admin; `PATCH /api/admin/templates/:id/status` body `{ status }` → 200 objek admin; `DELETE /api/admin/templates/:id` → 204. `:id` tak ada → 404.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('PUT hanya ganti nama tanpa thumb → 200, status active tetap active');
test('PUT ganti bg_color tanpa thumb → 422; dengan thumb → 200, status tetap');
test('PUT ganti slot tanpa thumb → 422; dengan thumb → 200, status jadi inactive');
test('PUT image baru: slot divalidasi terhadap ukuran PNG baru; status jadi inactive; file lama terhapus');
test('PUT image baru tanpa canvas_w/h → 422');
test('PUT rollback: storage.save gagal pada thumb → DB tidak berubah, file lama ada, tidak ada file baru');
test('PUT rollback: UPDATE DB gagal (trigger RAISE di tes) → 500, file baru dihapus, file lama ada');
test('PATCH active dengan slot valid → 200; status "hapus" → 422');
test('PATCH active pada template dengan slots_json tidak valid (disisipkan langsung ke DB) → 422');
test('PATCH archived lalu active lagi → diizinkan');
test('DELETE tanpa log → 204, file terhapus; dengan log → 409, tetap ada');
```

  Kegagalan `storage.save` disimulasikan dengan membungkus `storage` yang diberikan ke `makeTestApp` (save ke-2 melempar).
- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan PUT** sesuai §7 "Aturan PUT": `slotsChanged` = `JSON.stringify` slot ternormalisasi ≠ yang tersimpan; `thumb` wajib jika `image || slotsChanged || bgChanged`. Simpan file baru (`savePair` bila keduanya ada, `save` bila hanya thumb) → `UPDATE` dalam `db.transaction` → jika gagal, `remove` key baru dan lempar ulang → setelah sukses, `remove` key lama (kegagalan hanya di-log). Set `updated_at`.
- [ ] **Step 4: Implementasikan PATCH dan DELETE.** DELETE: cek `COUNT(*)` log → 409 `{ error: 'Template sudah dipakai; arsipkan saja' }`; hapus row lalu file.
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS.

### Task 2.4: Endpoint publik template, log sesi, dan statistik

**Files:**
- Create: `routes/stats.js`
- Modify: `routes/templates.js`, `server.js`
- Test: `test/public.test.js`, `test/stats.test.js`

**Interfaces:**
- Consumes: `dayBoundsUTC`, `config.tz`, `now`.
- Produces:
  - `GET /api/templates` → array publik, hanya `active`, urut `created_at DESC, id DESC`.
  - `GET /api/templates/:id` → objek publik; 404 jika tidak ada atau tidak `active`.
  - `SESSION_LOG_LIMIT = 120` (diekspor dari `routes/stats.js`), jendela 10 menit.
  - `POST /api/sessions` body `{ template_id }` → 201 `{ ok: true }`; field lain diabaikan.
  - `GET /api/admin/stats` → `{ templates: { active, inactive, archived }, sessions_today, top: [{ id, name, count }] }` (maks 5, sepanjang waktu, termasuk arsip).

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('daftar publik hanya active dan tanpa path; image_url berawalan /uploads/templates/');
test('detail inactive → 404; id bukan angka → 404');
test('POST /api/sessions: photo_count dari server walau body mengirim photo_count: 99');
test('POST /api/sessions: template inactive → 422; template_id "abc" → 422');
test('POST /api/sessions ke-121 dalam 10 menit → 429');
test('POST /api/sessions tidak butuh login atau Origin');
test('stats: sessions_today memakai batas hari Asia/Jakarta', () => {
  // now = 2026-10-12T18:30:00Z; log pada 2026-10-12T17:00:00.000Z (masuk) dan 2026-10-12T16:59:59.999Z (tidak)
});
test('stats: top 5 urut count menurun dan memuat template arsip');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan.** Query hari ini: `created_at >= ? AND created_at < ?` dengan batas dari `dayBoundsUTC(now(), config.tz)`.
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 2.5: Pengaturan

**Files:**
- Create: `routes/settings.js`
- Modify: `server.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: `getSettings`, `SETTINGS_SCHEMA`.
- Produces: `GET /api/settings` → `{ countdown_seconds, mirror_output }` (angka); `PUT /api/admin/settings` → 200 pengaturan lengkap setelah diubah; pembaruan parsial diizinkan.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('GET default { countdown_seconds: 3, mirror_output: 0 }');
test('PUT { countdown_seconds: 5 } → 200, GET berikutnya 5, mirror_output tetap 0');
test('PUT kunci tak dikenal → 400, tidak ada yang berubah (termasuk kunci valid di body yang sama)');
test('PUT countdown_seconds 0, 11, 2.5, "5" → 422; mirror_output 2 → 422');
test('PUT tanpa login → 401');
```

- [ ] **Step 2–4:** Jalankan (FAIL) → implementasikan (validasi semua kunci dulu, lalu tulis dalam satu transaksi) → jalankan (PASS).

### Task 2.6: `geometry.js` dan `strip.js`

**Files:**
- Create: `public/js/geometry.js`, `public/js/strip.js`
- Test: `test/geometry.test.js`

**Interfaces:**
- Produces (`geometry.js`, murni):
  - `coverScale(photoW, photoH, slotW, slotH) -> number` = `max(slotW/photoW, slotH/photoH)`
  - `clampTransform({ panX, panY, zoom }, photoW, photoH, slot) -> { panX, panY, zoom }`: zoom dibatasi 1–3; `maxPanX = (photoW*cover*zoom - slot.w) / (2*slot.w)`, pan dibatasi `[-maxPanX, maxPanX]` (sama untuk Y).
  - `photoRect(photoW, photoH, slot, transform) -> { x, y, w, h }` (koordinat template; tengah = tengah slot + `panX*slot.w`, `panY*slot.h`).
  - `fitWithin(w, h, maxSide) -> { w, h }` (tidak pernah memperbesar).
  - `previewScale(canvasW, canvasH, boxW, boxH, dpr) -> number` = `min(boxW/canvasW, boxH/canvasH) * min(dpr, 2)`.
  - `clientToTemplate(clientX, clientY, rect, canvasPxW, canvasPxH, scale) -> { x, y }`.
  - `hitSlot(slots, { x, y }) -> number` (−1 jika tidak kena).
  - `DEFAULT_TRANSFORM = { panX: 0, panY: 0, zoom: 1 }`.
- Produces (`strip.js`, DOM): `render(canvas, { template, img, photos, transforms, filtered, scale })` sesuai §12: memakai `filtered?.[i] ?? photos[i]`, slot tanpa foto dibiarkan berwarna latar, transform di-clamp sebelum digambar, PNG template digambar terakhir. `loadTemplateImage(url) -> Promise<HTMLImageElement>` (dengan `crossOrigin = 'anonymous'`).

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('coverScale: foto 1920x1080 ke slot 1100x1700 → 1700/1080');
test('photoRect transform default menutupi slot dan berpusat di slot');
test('clampTransform: zoom 5 → 3, zoom 0.5 → 1');
test('clampTransform: pan berlebih dibatasi sehingga photoRect tetap menutupi slot (tepi kiri ≤ slot.x, kanan ≥ slot.x+w)');
test('clampTransform: zoom turun setelah pan maksimal → pan ikut dibatasi ulang');
test('hasil sama untuk foto 1920 dan salinan 1024 pada transform yang sama'); // pan berbasis pecahan slot
test('fitWithin(4000, 3000, 1920) → 1920x1440; fitWithin(800, 600, 1920) → 800x600');
test('previewScale dengan dpr 3 dibatasi 2');
test('clientToTemplate memperhitungkan ukuran CSS ≠ ukuran kanvas dan scale');
test('hitSlot di dalam, di tepi, dan di luar');
```

- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan** `geometry.js`, lalu `strip.js` di atasnya (`ctx.save(); rect; clip(); drawImage(...photoRect × scale); restore()`, `imageSmoothingQuality = 'high'`).
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 2.7: Halaman admin: login, dashboard, pengaturan

**Files:**
- Create: `public/js/api.js`, `public/admin/login.html`, `public/admin/dashboard.html`, `public/admin/admin.js`, `public/css/app.css` (gaya dasar bersama)
- Modify: `server.js` (`GET /admin` → redirect ke `/admin/dashboard.html`)

**Interfaces:**
- Produces:
  - `api.js`: `class ApiError extends Error { status, retryAfter }`; `getJSON(url)`, `sendJSON(method, url, body)`, `sendForm(method, url, formData)` → Promise data JSON (atau `null` untuk 204); melempar `ApiError` dengan `message` dari `{ error }`.
  - `admin.js`: memilih halaman lewat `document.body.dataset.page` (`login` | `dashboard` | `edit`); `adminApi` = pembungkus `api.js` yang mengarahkan ke `/admin/login.html` pada setiap 401.

- [ ] **Step 1: Login page.** Form username/password; gagal → "Username atau password salah"; 429 → "Coba lagi dalam X menit", `X = ceil(retryAfter / 60)`. Berhasil → dashboard.
- [ ] **Step 2: Dashboard.** Saat dibuka: `GET /api/auth/me`, `GET /api/admin/stats`, `GET /api/admin/templates`, `GET /api/settings`. Kartu statistik; tabel dengan thumbnail `loading="lazy"`, nama, `canvas_w×canvas_h`, jumlah slot, status, pemakaian; aksi Edit (→ `template-edit.html?id=`), Aktifkan/Nonaktifkan, Arsipkan, Hapus (hanya jika `usage_count === 0`, dengan `confirm()`). Tombol "Template baru" dan Logout. Form pengaturan (angka 1–10 dan checkbox cermin) → `PUT /api/admin/settings`. Pesan error dari API tampil di area status. Semua render lewat `createElement`/`textContent`.
- [ ] **Step 3: Cek manual** di `http://localhost:3000/admin` dengan template hasil `npm run seed:sample`: login gagal/berhasil, rate limit setelah 5 kali, toggle status, ubah pengaturan, Hapus tersembunyi setelah ada log sesi (`curl -X POST` ke `/api/sessions`). Periksa konsol browser: tidak ada pelanggaran CSP.

### Task 2.8: Editor template, thumbnail, commit Tahap 2

**Files:**
- Create: `public/admin/template-edit.html`
- Modify: `public/admin/admin.js`

**Interfaces:**
- Consumes: `validateCanvas`, `validateSlots`, `MAX_SLOTS`, `render`, `DEFAULT_TRANSFORM`, `adminApi`.
- Produces (di `admin.js`): `makeThumbnail(img, template) -> Promise<Blob>` — sisi terpanjang 400 px, `render` dengan setiap slot diisi canvas abu-abu `#9e9e9e`, `toBlob('image/jpeg', 0.85)`.

- [ ] **Step 1: Form** sesuai §13 langkah 1–3: pilih PNG (object URL → `naturalWidth/Height` ke kolom `canvas_w/h` read-only), nama, warna latar (`<input type=color>`), daftar slot x/y/w/h dengan tambah/hapus/↑/↓, maks 8. Mode edit (`?id=`): data dari `GET /api/admin/templates`, gambar dari `image_url`.
- [ ] **Step 2: Pratinjau langsung** (§13 langkah 5): `render` dengan foto contoh berupa canvas berwarna bernomor, lalu garis tepi slot; merah untuk `slotErrors`, kuning untuk `overlaps`; pesan `errors` di bawah pratinjau. Render ulang lewat `requestAnimationFrame` saat ada input berubah.
- [ ] **Step 3: Simpan.** Tombol Simpan nonaktif selama `errors` tidak kosong. Kirim `FormData` (POST atau PUT); `thumb = makeThumbnail(...)` selalu dikirim pada POST, dan pada PUT bila PNG, slot, atau warna berubah. Setelah sukses: tampilkan "Tersimpan sebagai nonaktif" (atau status hasil), aktifkan tombol Aktifkan (`PATCH status active`). Respons 413/400/422 ditampilkan apa adanya.
- [ ] **Step 4: Cek manual:** buat template baru dari PNG sendiri, simpan, aktifkan, lalu pastikan `GET /api/templates` memuatnya dan thumbnail tampil di dashboard. Coba slot di luar kanvas (tombol Simpan mati) dan slot tumpang tindih (kuning, tetap bisa disimpan).
- [ ] **Step 5: Jalankan** `npm test` — Expected: PASS semua.
- [ ] **Step 6: Commit Tahap 2 dan berhenti untuk diperiksa**

```bash
git add -A
git commit -m "feat: admin template CRUD, settings, stats, thumbnails"
```

---

# TAHAP 3 — Alur pengguna

### Task 3.1: `filters.js` (Normal, Hitam putih, Sepia)

**Files:**
- Create: `public/js/filters.js`
- Test: `test/filters.test.js`

**Interfaces:**
- Produces: `FILTERS: Array<{ id: string, label: string, matrix: number[][] | null }>` — matriks 3×4, baris `[r, g, b, offset]` per kanal keluaran; `applyMatrix(data: Uint8ClampedArray, matrix) -> void` (in place, alpha tidak diubah); `filteredCanvas(source: HTMLCanvasElement, filterId, maxSide?) -> HTMLCanvasElement | null` (`null` untuk Normal).
  - `normal`: "Normal", `null`
  - `bw`: "Hitam putih", setiap baris `[0.299, 0.587, 0.114, 0]`
  - `sepia`: "Sepia", `[[0.393,0.769,0.189,0],[0.349,0.686,0.168,0],[0.272,0.534,0.131,0]]`

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('bw: piksel (255,0,0,200) → r=g=b=76, alpha 200');
test('sepia: putih (255,255,255) → (255,255,239) karena clamp');
test('urutan FILTERS: normal, bw, sepia; normal.matrix null');
test('id unik dan label berbahasa Indonesia');
```

- [ ] **Step 2–4:** Jalankan (FAIL) → implementasikan → jalankan (PASS). `filteredCanvas` (DOM) tidak diuji di Node.

### Task 3.2: `state.js` dan logika murni `camera.js`

**Files:**
- Create: `public/js/state.js`, `public/js/camera.js`
- Test: `test/state.test.js`, `test/camera.test.js`

**Interfaces:**
- Produces (`state.js`):
  - `createState() -> { template: null, settings: null, photos: [], transforms: [], filter: 'normal', facingRequested: 'user', logged: false }`
  - `releaseCanvas(c)` (set `width = height = 0` bila ada)
  - `changeTemplate(state, template) -> { dropped: number }`: foto dipertahankan sesuai urutan, foto berlebih dilepas, transform di-reset ke `DEFAULT_TRANSFORM`, `logged = false`. Konfirmasi ke pengguna dilakukan pemanggil **sebelum** memanggil fungsi ini (lewat `wouldDrop(state, template) -> number`).
  - `nextEmptySlot(state) -> number` (−1 bila penuh)
  - `resetPhotos(state)` (Ulang sesi) dan `resetAll(state)` (Sesi baru); keduanya melepas canvas.
- Produces (`camera.js`, bagian murni — modul tidak menyentuh DOM saat diimpor):
  - `cameraErrorMessage(err) -> string` untuk tabel §11
  - `isFrontCamera({ facingRequested, reportedFacing, pickedByDeviceId, isTouch }) -> boolean`: jika `reportedFacing` ada → `=== 'user'`; jika dipilih lewat `deviceId` di perangkat non-sentuh → `true`; selainnya `facingRequested === 'user'`.
  - `createRestartPolicy(max = 3) -> { shouldRetry() -> boolean, success() }`
- Produces (`camera.js`, DOM): `start(video, pref: { deviceId?, facingMode? })`, `listCameras()`, `flip()`, `capture(video, maxSide, { mirror })`, `stop()`, `onStreamLost(cb)` sesuai §11. `stop()` melepas `track.onended` sebelum `track.stop()` (Review Focus 4).

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('changeTemplate 3→2 slot: dropped 1, foto ke-3 dilepas (width 0), transforms panjang 2 default');
test('changeTemplate 2→4: foto tetap, nextEmptySlot = 2');
test('wouldDrop menghitung tanpa mengubah state');
test('resetAll melepas semua canvas dan mengosongkan template');
test('cameraErrorMessage: NotAllowedError, NotFoundError, NotReadableError, insecure, lainnya');
test('isFrontCamera: environment dilaporkan → false walau diminta user');
test('isFrontCamera: laptop pilih deviceId tanpa facing → true; ponsel deviceId tanpa facing, diminta environment → false');
test('restartPolicy: 3 kali true, ke-4 false; success() mereset hitungan');
```

  Canvas di tes adalah objek biasa `{ width: 10, height: 10 }`.
- [ ] **Step 2: Jalankan** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implementasikan** bagian murni, lalu fungsi DOM `camera.js` sesuai §11 (`playsinline`, `muted`, fallback `OverconstrainedError` → `{ video: true }`, `localStorage` dalam try/catch, deviceId yang hilang dihapus).
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS.

### Task 3.3: `index.html`, Beranda, Pilih template

**Files:**
- Create: `public/index.html`, `public/js/app.js`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `api.js`, `state.js`, `loadTemplateImage`.
- Produces: `app.js` `show(screen: 'home' | 'pick' | 'booth' | 'adjust' | 'result')` yang menyembunyikan layar lain dan memperbarui indikator progres (Template → Foto → Atur → Unduh).

- [ ] **Step 1:** Kerangka lima `<section>` dan indikator progres; tata letak yang dipakai di tablet potret/lanskap dan ponsel.
- [ ] **Step 2: Beranda:** tombol Mulai; banner browser dalam aplikasi bila UA cocok `/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter/i`, berisi tombol salin link (`navigator.clipboard` dengan cadangan pilih teks) dan `<input readonly>` berisi `location.href`; bisa ditutup.
- [ ] **Step 3: Pilih template:** `GET /api/templates` dan `GET /api/settings` paralel; grid `<img loading="lazy" src=thumb_url>`; gagal → pesan + tombol "Coba lagi". Memilih → `loadTemplateImage(image_url)` → booth.
- [ ] **Step 4: Cek manual** di desktop: daftar tampil, kegagalan jaringan (matikan server) memunculkan Coba lagi.

### Task 3.4: Layar Booth

**Files:**
- Modify: `public/index.html`, `public/js/app.js`, `public/css/app.css`

**Interfaces:**
- Consumes: `camera.*`, `isFrontCamera`, `createRestartPolicy`, `fitWithin`, `nextEmptySlot`, `state.settings.countdown_seconds`, `state.settings.mirror_output`.

- [ ] **Step 1:** Area video mengikuti rasio slot aktif (`aspect-ratio: w / h`, `object-fit: cover`); pratinjau dicermin lewat CSS bila `isFrontCamera`.
- [ ] **Step 2:** Tombol Ambil → hitung mundur `countdown_seconds` → flash → `capture(video, 1920, { mirror: mirror_output === 1 && isFrontCamera(...) })` → jeda ~800 ms → slot kosong berikutnya, sampai penuh → layar Atur. Tombol Batal menghentikan hitung mundur dan urutan (foto yang sudah diambil tetap).
- [ ] **Step 3:** Balik kamera (hanya bila > 1 kamera), pilih kamera (`<select>`), layar penuh (hanya bila `document.fullscreenEnabled`), Wake Lock selama di booth dan diminta ulang saat `visibilitychange`.
- [ ] **Step 4:** Pemulihan stream: `onStreamLost` dan `visibilitychange` → restart dengan `createRestartPolicy(3)`; habis → pesan error.
- [ ] **Step 5:** Pesan error kamera dari `cameraErrorMessage`, selalu dengan tombol unggah dari galeri.
- [ ] **Step 6:** Unggah dari galeri (`accept="image/*" multiple`) mengisi slot kosong berurutan: `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth/resizeHeight dari fitWithin })` dengan cadangan `<img>` + object URL; pesan per file yang gagal ("foto.heic tidak bisa dibuka"). Foto galeri tidak pernah dicermin.
- [ ] **Step 7: Cek manual** di Chrome laptop: hitung mundur, Batal, isi semua slot, galeri.

### Task 3.5: Layar Atur

**Files:**
- Modify: `public/index.html`, `public/js/app.js`, `public/css/app.css`

**Interfaces:**
- Consumes: `render`, `clampTransform`, `clientToTemplate`, `hitSlot`, `previewScale`, `filteredCanvas`, `FILTERS`, `changeTemplate`, `wouldDrop`.

- [ ] **Step 1:** Pratinjau `render` dengan `previewScale` dan `requestAnimationFrame`; `filtered` = salinan 1024 px per foto, dibuat ulang hanya saat filter diganti (Normal → tanpa salinan, salinan lama dilepas).
- [ ] **Step 2:** Kanvas `touch-action: none`; Pointer Events + `setPointerCapture`; ketuk memilih slot (`hitSlot`); satu pointer geser (delta template ÷ ukuran slot → pan); dua pointer cubit (rasio jarak → zoom); setiap perubahan lewat `clampTransform`. Slider zoom 1–3 dan tombol −/+ untuk slot terpilih.
- [ ] **Step 3:** Ulang foto slot terpilih (booth hanya untuk slot itu, lalu kembali ke Atur). Pilihan filter dari `FILTERS`. Ganti template: grid yang sama; bila `wouldDrop > 0` minta konfirmasi; setelah `changeTemplate`, bila ada slot kosong → booth, bila tidak → Atur.
- [ ] **Step 4: Cek manual** di desktop dan ponsel (tunnel): geser tidak pernah memperlihatkan latar di slot, cubit, slider, ganti template 3→2 dan 2→4.

### Task 3.6: Layar Hasil dan unduh

**Files:**
- Modify: `public/index.html`, `public/js/app.js`

**Interfaces:**
- Consumes: `render`, `filteredCanvas`, `sendJSON`, `resetPhotos`, `resetAll`.

- [ ] **Step 1:** Saat layar dibuka: tombol Unduh nonaktif "Menyiapkan..."; `filteredCanvas` resolusi penuh per foto → `render(scale = 1)` → lepas salinan → `toBlob('image/jpeg', 0.92)` → `new File([blob], 'photobooth-YYYYMMDD-HHmmss.jpg')` (waktu lokal). Pratinjau dari object URL. Kembali ke Atur lalu mengubah sesuatu membuang hasil (dan me-revoke URL-nya).
- [ ] **Step 2:** Unduh sesuai urutan §12: share (perangkat sentuh + `canShare({ files })`, `AbortError` diam) → `<a download>` + `revokeObjectURL` setelah ~1 dtk → iOS lama (`!('download' in HTMLAnchorElement.prototype)`): tampilan layar penuh "Tekan lama gambar lalu pilih Simpan".
- [ ] **Step 3:** Pada Unduh pertama: `sendJSON('POST', '/api/sessions', { template_id })` tanpa `await` di jalur unduh; `.then(() => state.logged = true).catch(() => {})`.
- [ ] **Step 4:** Ulang sesi (`resetPhotos` → booth) dan Sesi baru (`resetAll` → pilih template); keduanya me-revoke object URL hasil.

### Task 3.7: Uji lintas perangkat, dokumentasi, commit Tahap 3

**Files:**
- Create: `docs/manual-test.md`
- Modify: `README.md`

- [ ] **Step 1: Tulis `docs/manual-test.md`** sebagai tabel checklist: baris = kasus §14 (Manual) ditambah "ganti kamera tidak memicu restart berulang" (Review Focus 4) dan "aset tidak diblokir CSP di HTTP lokal" (Review Focus 5); kolom = Chrome laptop + webcam bawaan, webcam USB, Chrome Android, Safari iPhone/iPad.
- [ ] **Step 2: Jalankan checklist** lewat `cloudflared tunnel --url http://localhost:3000` di semua perangkat yang tersedia; isi hasil dan catat perangkat yang belum diuji.
- [ ] **Step 3: Lengkapi README:** catatan resolusi webcam (699×1080, sarankan slot lanskap), syarat CORS bila storage pindah domain, HTTPS wajib, satu instance, `client_max_body_size 6m`, cara tunnel.
- [ ] **Step 4: Jalankan** `npm test` — Expected: PASS semua.
- [ ] **Step 5: Commit Tahap 3 dan berhenti untuk diperiksa**

```bash
git add -A
git commit -m "feat: user booth flow (camera, adjust, filters, download)"
```

---

# TAHAP 4 — Kalau sempat

Setiap butir independen; kerjakan sesuai urutan, satu commit untuk tahap ini.

### Task 4.1: Deteksi slot otomatis

**Files:**
- Create: `public/js/detect-slots.js`
- Modify: `public/admin/template-edit.html`, `public/admin/admin.js`
- Test: `test/detect-slots.test.js`

**Interfaces:**
- Produces: `detectSlots(alpha: Uint8Array | Uint8ClampedArray, width, height, { threshold = 128, minAreaRatio = 0.005 } = {}) -> Array<{ x, y, w, h }>` — flood fill iteratif 4-tetangga dengan stack `Int32Array` dan penanda `Uint8Array` pada piksel `alpha < threshold`; komponen dengan jumlah piksel `< minAreaRatio × width × height` dibuang; urutan: urutkan menurut `y`, kelompokkan ke baris (slot masuk baris aktif bila `slot.y < first.y + first.h / 2`), tiap baris diurutkan menurut `x`.

- [ ] **Step 1: Tulis tes yang gagal**

```js
test('tiga lubang vertikal → tiga kotak dengan koordinat tepat, urut atas ke bawah');
test('grid 2x2 dengan y sedikit berbeda (±5 px) → urut kiri-kanan per baris');
test('lubang kecil < 0,5% luas diabaikan');
test('tanpa lubang → []');
test('alpha 127 dihitung lubang, 128 tidak (ambang default)');
test('kanvas 4000x3000 penuh lubang selesai tanpa stack overflow');
```

- [ ] **Step 2–4:** Jalankan (FAIL) → implementasikan → jalankan (PASS).
- [ ] **Step 5:** Tombol "Deteksi slot" di editor: alpha dari `getImageData` gambar PNG, indikator "Sedang memproses...", jalankan setelah `setTimeout(0)` agar indikator tergambar. Hasil 1–8 → ganti daftar slot; 0 atau > 8 → peringatan, daftar tidak diubah.

### Task 4.2: Filter Hangat, Dingin, Kontras

**Files:**
- Modify: `public/js/filters.js`, `test/filters.test.js`

- [ ] **Step 1: Tambah tes:** urutan lengkap `normal, bw, sepia, warm, cool, contrast`; kontras: abu 128 tetap 128, 200 → 222.
- [ ] **Step 2: Tambah matriks:** `warm` (Hangat) `[[1.1,0,0,10],[0,1.02,0,5],[0,0,0.9,-10]]`; `cool` (Dingin) `[[0.9,0,0,-10],[0,1,0,0],[0,0,1.1,15]]`; `contrast` (Kontras) diagonal 1.3 dengan offset `-38.4` (= 128 × (1 − 1.3)).
- [ ] **Step 3: Jalankan** `npm test` — Expected: PASS.

### Task 4.3: Zoom roda mouse dan commit Tahap 4

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1:** `wheel` (`passive: false`, `preventDefault`) pada kanvas Atur: `zoom *= Math.exp(-deltaY * 0.001)` untuk slot terpilih, lewat `clampTransform`, slider ikut diperbarui.
- [ ] **Step 2:** Cek manual di desktop; perbarui `docs/manual-test.md`.
- [ ] **Step 3: Jalankan** `npm test` — Expected: PASS.
- [ ] **Step 4: Commit Tahap 4 dan berhenti untuk diperiksa**

```bash
git add -A
git commit -m "feat: slot auto-detect, extra filters, wheel zoom"
```
