# Kirim Hasil, GIF/Video, dan Cermin — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tamu bisa memilih cermin, mendapat GIF stop-motion dan (opsional) video sesi, serta menerima hasil lewat QR, email (SMTP Gmail), dan WhatsApp (Cloud API Meta), dengan hasil tersimpan 7 hari di server.

**Architecture:** Browser tetap menyusun photostrip, GIF (Web Worker + `gifenc`), dan video (`MediaRecorder` dari canvas). File jadi diunggah ke server hanya setelah persetujuan tamu. Server (Express + SQLite) menyimpan file di `<UPLOAD_DIR>/results/<token>/`, menyajikan halaman `/p/:token`, membuat QR, dan mengirim lewat antrean di dalam proses dengan percobaan ulang. Pembersihan berjalan per jam.

**Tech Stack:** Node.js 24 (ESM), Express 5, better-sqlite3, multer 2, express-rate-limit. Dependensi baru: `nodemailer`, `qrcode`, dan `gifenc` (disalin ke `public/vendor/`). Tes memakai `node:test` + `supertest`. Uji browser memakai Chrome headless + `--use-fake-device-for-media-stream`.

**Spec:** `docs/superpowers/specs/2026-10-23-share-media-mirror-design.md` (spec C). Nomor § merujuk ke spec ini. Aturan sub-proyek A tetap berlaku (`docs/superpowers/specs/2026-10-12-redesign-kiosk-design.md`).

## Global Constraints

- Cabang kerja: `feat/share-media`, dibuat dari `feat/redesign-kiosk`. Satu commit per task (conventional commits, diakhiri trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). `npm test` lulus sebelum setiap commit.
- Foto tamu hanya diunggah setelah persetujuan (`consent=1`). Tombol Unduh tidak pernah mengunggah.
- `RESULT_TTL_DAYS = 7`. Token adalah 16 byte acak dalam base64url (22 karakter). Kunci unggah adalah 32 byte acak base64url, disimpan sebagai hash sha256 hex, dikirim lewat header `X-Result-Key`, dan dibandingkan dengan `timingSafeEqual`.
- Batas file: foto JPEG ≤ 8 MB, GIF ≤ 10 MB, video mp4/webm ≤ 30 MB. Jenis file diperiksa dengan magic byte, bukan header `Content-Type` saja.
- Batas laju per IP: `RESULT_CREATE_LIMIT = 60` dan `DELIVERY_LIMIT = 30` per 10 menit. Maksimal `MAX_DELIVERIES_PER_RESULT = 3`.
- Antrean: `MAX_ATTEMPTS = 3`, jeda `[30_000, 120_000]` ms, worker setiap 3000 ms dengan batch 2.
- Penjaga disk menolak dengan 507 bila ruang kosong `< max(100 MB, 15% total)` pada `UPLOAD_DIR`.
- Pengaturan baru: `mirror_default` 0–1 (default 1), `contact_before` 0–1 (default 0), `video_enabled` 0–1 (default 0). `mirror_output` dihapus.
- Env email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (default `SMTP_USER`), dan khusus tes/dev `MAIL_TRANSPORT=json`. Env WhatsApp: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_TEMPLATE_NAME`, `WA_TEMPLATE_LANG`, dan `WA_API_BASE` (default `https://graph.facebook.com/v21.0`). Nilai env tidak pernah dikirim ke browser.
- Teks landing, booth, dan halaman hasil lewat i18n. Setiap kunci baru ada di `id.js` dan `en.js` (dijaga `test/i18n*.test.js`). Admin tetap berbahasa Indonesia.
- Tanpa `innerHTML` untuk data server. CSP tetap `default-src 'self'` (worker dari `self`; gambar `blob:` sudah diizinkan; QR berupa SVG dari `self`).
- Interval latar belakang (pembersihan, worker) memakai `unref()` dan tidak berjalan saat `NODE_ENV=test`. Tes memanggil `tick()`/`cleanup()` secara langsung.
- Uji browser: server terisolasi (port dan DB sendiri di scratchpad), menghentikan proses hanya berdasarkan PID sendiri (jangan pernah `taskkill /IM`), dan semua file sementara di scratchpad.

## Review Focus

1. **Kiosk reset saat unggahan atau QR sedang berjalan.** Respons unggahan yang datang setelah reset tidak boleh menampilkan QR atau kontak di layar tamu berikutnya. Diuji di Task 2.4, langkah browser "reset saat unggah".
2. **Tombol Kirim diketuk dua kali dengan cepat.** Hanya satu kiriman yang diantrekan per ketukan (tombol terkunci selama request), dan server tetap membatasi 3 kiriman per hasil. Diuji di Task 3.3 (server) dan Task 3.4 (browser).
3. **SMTP salah atau Gmail menolak login.** Kiriman berakhir `failed` setelah 3 percobaan dan booth menampilkan "Gagal mengirim", tidak menggantung di "Sedang dikirim". Diuji di Task 3.3 dengan pengirim yang selalu melempar error.
4. **Format kontak yang berantakan** (`+62 812-3456-7890`, ` Rina@Gmail.com `). Hasilnya dinormalisasi atau di-trim, bukan ditolak. Diuji di Task 3.1.
5. **Link kedaluwarsa atau token acak.** `/p/:token` menampilkan pesan yang jelas, `/r/...` mengembalikan 410/404, dan tidak ada 500. Diuji di Task 2.2.

---

# TAHAP 1 — Cermin

- [ ] **Step 0: Buat cabang:** `git checkout feat/redesign-kiosk && git checkout -b feat/share-media`

### Task 1.1: Pengaturan baru menggantikan `mirror_output`

**Files:**
- Modify: `db/index.js`, `public/js/booth/main.js` (`DEFAULT_SETTINGS`), `public/admin/settings.html`, `public/admin/pages/settings.js`
- Test: `test/settings.test.js`, `test/public.test.js`, `test/db.test.js`

**Interfaces:**
- Produces: `SETTINGS_SCHEMA` berisi `countdown_seconds`, `mirror_default {0,1,1}`, `kiosk_idle_seconds`, `review_seconds`, `sound_default`, `contact_before {0,1,0}`, `video_enabled {0,1,0}`. `mirror_output` tidak ada lagi.

- [ ] **Step 1: Perbarui tes.** `DEFAULTS` di `test/settings.test.js` menjadi `{ countdown_seconds: 3, mirror_default: 1, kiosk_idle_seconds: 90, review_seconds: 3, sound_default: 1, contact_before: 0, video_enabled: 0 }`. Ubah juga pembanding di `test/public.test.js` dan `test/db.test.js`. Tambahkan tes:
  - `PUT { mirror_output: 1 }` → 400.
  - `PUT { contact_before: 2 }` dan `{ video_enabled: -1 }` → 422.
  - `PUT { mirror_default: 0, contact_before: 1, video_enabled: 1 }` → 200 dan nilainya tersimpan.
- [ ] **Step 2:** `node --test test/settings.test.js test/public.test.js test/db.test.js` → FAIL.
- [ ] **Step 3: Implementasi.**
  - Ubah `SETTINGS_SCHEMA`. Baris lama `mirror_output` di tabel `settings` dibiarkan; `getSettings` sudah mengabaikan kunci di luar skema.
  - Halaman Pengaturan admin: ganti saklar "Cerminkan hasil" dengan **Cermin default** (`mirror_default`), lalu tambahkan grup **Hasil & Kirim** berisi saklar `contact_before` dan `video_enabled`. Ketiganya ikut disimpan lewat PUT yang sudah ada.
  - `DEFAULT_SETTINGS` booth disesuaikan.
- [ ] **Step 4:** `npm test` → PASS. Lalu `grep -rn mirror_output public routes db lib` hanya boleh menyisakan `shoot.js` dan `camera.js`, yang diganti di Task 1.2.
- [ ] **Step 5: Commit** `feat: mirror_default, contact_before and video_enabled settings`.

### Task 1.2: Tombol Cermin di layar Berpose

**Files:**
- Create: `public/js/booth/mirror.js`
- Modify: `public/js/booth/screens/shoot.js`, `public/js/camera.js` (komentar), `public/js/storage.js` (`KEYS.mirror = 'pb.mirror'`), `public/booth.html`, `public/css/booth.css`, `public/js/i18n/id.js`, `public/js/i18n/en.js`
- Test: `test/mirror.test.js`, `test/local-store.test.js`

**Interfaces:**
- Produces:
  - `initialMirror({ front: boolean, stored: string | null, settingDefault: number }) -> boolean`: kamera belakang → `false`; kamera depan dengan `stored` `'1'`/`'0'` → nilai itu; selain itu `settingDefault === 1`.
  - Di `shoot.js`: `export function isMirrored() -> boolean` (dipakai GIF/video di Task 4.1/5.1).

- [ ] **Step 1: Tulis tes yang gagal.**
  - `initialMirror({ front: false, stored: '1', settingDefault: 1 }) === false`
  - `({ front: true, stored: '0', settingDefault: 1 }) === false`
  - `({ front: true, stored: null, settingDefault: 1 }) === true`
  - `({ front: true, stored: 'x', settingDefault: 0 }) === false`

  Tambahkan juga `KEYS.mirror === 'pb.mirror'` ke tes KEYS.
- [ ] **Step 2:** `node --test test/mirror.test.js test/local-store.test.js` → FAIL.
- [ ] **Step 3: Implementasi.**
  - Tombol `#mirror-toggle` (`aria-pressed`, label i18n, ≥44 px) di alat Berpose.
  - State dihitung ulang setiap kamera berganti, memakai `frontCamera()` yang sudah ada.
  - Klik membalik state. Untuk kamera depan, simpan `write(KEYS.mirror, on ? '1' : '0')`.
  - Class `mirror` pada `#video` = state. Penangkapan foto memakai `camera.capture(video, MAX_PHOTO_SIDE, { mirror: isMirrored() })`, menggantikan `mirror_output && frontCamera()`. Foto dari galeri tetap tidak dicermin.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser dengan kamera palsu: cermin aktif membuat pratinjau dan hasil sama-sama terbalik; matikan, lalu foto berikutnya tidak terbalik (bandingkan piksel kolom kiri hasil dengan bingkai video). Pilihan bertahan setelah reload.
- [ ] **Step 5: Commit** `feat: mirror toggle that applies to preview and result`.

---

# TAHAP 2 — Hasil tersimpan, QR, dan halaman hasil

### Task 2.1: Penyimpanan hasil di server

**Files:**
- Create: `lib/sniff.js`, `lib/results-store.js`
- Modify: `db/index.js` (tabel `results` dan `deliveries` persis seperti §3.1), `package.json` (`npm i nodemailer qrcode`)
- Test: `test/sniff.test.js`, `test/results-store.test.js`

**Interfaces:**
- Produces:
  - `sniff(buf: Buffer) -> 'jpg' | 'gif' | 'mp4' | 'webm' | null`:
    - JPEG `FF D8 FF`
    - GIF `GIF87a`/`GIF89a`
    - MP4 dengan byte 4–7 `ftyp`
    - WebM `1A 45 DF A3`
  - `RESULT_TTL_DAYS = 7`
  - `createResultsStore({ db, uploadDir, now = () => new Date(), statfs = fs.promises.statfs })`, yang mengembalikan:
    - `create({ photo: Buffer, templateId: number | null, lang: 'id' | 'en', baseUrl: string }) -> Promise<{ token, key, expiresAt }>`
    - `get(token) -> { id, token, lang, base_url, has_gif, video_type, expires_at, expired: boolean } | null`
    - `verifyKey(row, key: string | undefined) -> boolean`
    - `addAsset(token, kind: 'gif' | 'video', buf: Buffer, ext: 'gif' | 'mp4' | 'webm') -> Promise<void>`: menulis `anim.gif`, atau `video.mp4`/`video.webm` (menghapus ekstensi video yang lain); memperbarui `has_gif`/`video_type`/`bytes`.
    - `filePath(token, name: 'photo.jpg' | 'anim.gif' | 'video.mp4' | 'video.webm') -> string`
    - `checkDisk() -> Promise<{ ok: boolean, total: number, free: number }>`
    - `cleanup() -> Promise<number>` (jumlah hasil yang dihapus)
    - `summary() -> { count, bytes }`
    - `removeAll() -> Promise<void>`
  - Menulis file memakai file sementara lalu `rename`, sehingga kegagalan tidak meninggalkan sisa.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `sniff`: keempat jenis dikenali, PNG → `null`, buffer kosong → `null`.
  - Store dengan folder sementara dan jam palsu `2026-10-23T00:00:00Z`:
    - `create` → token cocok `/^[A-Za-z0-9_-]{22}$/`, `expiresAt === '2026-10-30T00:00:00.000Z'`, `photo.jpg` ada, `key` tidak tersimpan apa adanya di DB (cari string key di semua kolom).
    - `verifyKey` benar/salah/undefined.
    - `addAsset('video', webmBuf, 'webm')` lalu `addAsset('video', mp4Buf, 'mp4')` → hanya `video.mp4` yang tersisa dan `video_type === 'mp4'`.
    - Jam dimajukan ke `2026-10-30T00:00:01Z` → `get().expired === true`; `cleanup()` mengembalikan 1, folder hilang, baris `deliveries` milik hasil itu ikut hilang.
    - `statfs` palsu dengan `{ bsize: 4096, blocks: 262144, bavail: 20000 }` → `checkDisk().ok === false`; dengan `bavail: 200000` → `true`.
    - `removeAll()` mengosongkan tabel dan folder.
- [ ] **Step 2:** `node --test test/sniff.test.js test/results-store.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Pastikan juga `PRAGMA foreign_keys = ON` membuat cascade bekerja (sudah aktif di `openDb`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: result storage with expiry, disk guard and cleanup`.

### Task 2.2: API hasil, file, QR, dan rute halaman

**Files:**
- Create: `routes/results.js`
- Modify: `server.js`, `config.js` (tidak ada perubahan env di task ini)
- Test: `test/results-api.test.js`, `test/server.test.js`

**Interfaces:**
- Consumes: `createResultsStore` (2.1), `sniff`, `checkOrigin`, `noStore`
- Produces:
  - `resultsApiRouter({ store, queue = null, services = { email: false, whatsapp: false } })`, dipasang di `/api/results`. Menyediakan `POST /`, `PUT /:token/gif`, `PUT /:token/video`, `GET /:token`, `GET /:token/qr.svg`; endpoint `send`/`deliveries` ditambahkan di Task 3.3.
  - `resultFilesRouter({ store })`, dipasang di `/r`.
  - `GET /p/:token` mengirim `public/result.html` (dibuat di 2.3; di task ini cukup berkas sementara berisi `<!doctype html><title>Photobooth</title>` supaya rute bisa diuji).
  - `createApp({ ..., resultsStatfs })` meneruskan `statfs` ke store (untuk tes), membuat `store`, dan menyimpannya di `app.locals.results`. Bila `NODE_ENV !== 'test'`, `cleanup()` dijalankan saat start lalu setiap jam dengan `unref`.
  - Respons `POST /` berbentuk `{ token, key, url: base_url + '/p/' + token, expires_at }`, dengan `base_url = req.protocol + '://' + req.get('host')`.

- [ ] **Step 1: Tulis tes yang gagal** `test/results-api.test.js` (pakai `makeTestApp`, `mutate`, dan JPEG kecil dari `test/fixtures/thumb.jpg`):
  - Membuat hasil:
    - POST dengan `photo` + `consent=1` + `lang=id` → 201, dan `url` diakhiri `/p/<token>`.
    - Tanpa `consent` → 422. Foto PNG → 422. Tanpa Origin → 403.
    - Foto 8 MB + 1 → 413.
    - `statfs` penuh (lewat `makeTestApp({ resultsStatfs })`) → 507.
    - Setelah setiap penolakan, folder `results` tidak berisi sisa.
  - Menambah file:
    - PUT gif dengan kunci benar → 204, lalu `GET /api/results/:token` memuat `gif_url` = `/r/<token>/anim.gif`.
    - Kunci salah → 403, tanpa kunci → 403, body bukan GIF → 422.
    - PUT video webm → 204, dan `video_type: 'webm'`.
  - Membaca hasil:
    - `GET` token acak berformat valid → 404. `GET` hasil kedaluwarsa (jam dimajukan 7 hari + 1 detik) → 410.
    - Respons `GET` tidak pernah memuat `key` atau `key_hash`.
  - File:
    - `GET /r/<token>/photo.jpg` → 200, `content-type` image/jpeg, `cache-control` mengandung `private`, dan `x-robots-tag: noindex`.
    - `?download=1` → `content-disposition` attachment.
    - Nama file lain (`/r/<token>/../x`, `/r/<token>/secret.txt`) → 404. Hasil kedaluwarsa → 410.
    - Video mendukung header `Range` (→ 206).
  - `GET /api/results/:token/qr.svg` → 200 `image/svg+xml` yang memuat `<svg`.
  - Halaman: `GET /p/<token valid 22 char>` → 200 HTML. `GET /p/abc` → 404.
  - Batas laju: permintaan ke-61 dalam 10 menit → 429 (pakai foto kecil).
- [ ] **Step 2:** `node --test test/results-api.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Foto memakai `multer` `memoryStorage` dengan `limits: { fileSize: 8 MB, files: 1, fields: 5 }`. GIF/video memakai `express.raw({ type: ['image/gif'] | ['video/mp4','video/webm'], limit })` per rute. File disajikan dengan `res.sendFile` (sudah mendukung Range) dari `store.filePath`, dengan whitelist nama file.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: results API, file serving, QR and result page route`.

### Task 2.3: Halaman hasil `/p/:token`

**Files:**
- Create: `public/result.html` (menggantikan berkas sementara), `public/js/result-page.js`, `public/css/result.css`
- Modify: `public/js/i18n/id.js`, `public/js/i18n/en.js`, `test/i18n-usage.test.js` (ikut memindai `result.html`)
- Test: `test/i18n-usage.test.js`, `test/html-csp.test.js` (otomatis)

**Interfaces:**
- Consumes: `GET /api/results/:token` (2.2), i18n, tema, `brand.js`
- Produces: halaman sesuai §3.3, dengan `data-skin="fun"`, `<meta name="robots" content="noindex">`, dan bahasa default dari `lang` hasil (bisa diganti lewat select, tanpa menimpa `pb.lang` booth).

- [ ] **Step 1:** Tambahkan `public/result.html` ke daftar file yang dipindai `test/i18n-usage.test.js`. Jalankan → FAIL (kunci belum ada).
- [ ] **Step 2: Bangun halaman.**
  - Foto, GIF (`<img>`), dan video (`<video controls playsinline>`).
  - Tombol Unduh per file memakai `?download=1`.
  - **Kirim ke WhatsApp:** `https://wa.me/?text=` + teks i18n + URL halaman.
  - **Bagikan** bila `navigator.share` tersedia.
  - Polling setiap 5000 ms selama ada file `null` dan umur hasil < 10 menit.
  - Respons 410 dan 404 masing-masing menampilkan pesan dari kamus.
- [ ] **Step 3:** `npm test` → PASS. Lalu cek di browser: buat hasil lewat API dengan curl/node, lalu buka `/p/<token>` di 390 dan 1440, terang dan gelap. Tambahkan GIF lewat PUT; dalam ≤ 5 detik GIF muncul sendiri. Hasil kedaluwarsa (ubah `expires_at` di DB) menampilkan pesan dihapus. Tidak ada error konsol atau CSP.
- [ ] **Step 4: Commit** `feat: public result page with downloads and WhatsApp share`.

### Task 2.4: Panel Kirim di layar Hasil — QR dan persetujuan

**Files:**
- Create: `public/js/booth/share.js`
- Modify: `public/js/booth/screens/result.js`, `public/js/booth/main.js`, `public/booth.html`, `public/css/booth.css`, kamus i18n
- Test: `test/share-state.test.js`

**Interfaces:**
- Consumes: `ctx.result.current()` → `{ file }`, `ctx.onReset`, `ctx.visit()`, API 2.2
- Produces, dari `share.js`:
  - `createShareSession({ api, now }) -> { ensureResult(file: File, meta: { templateId, lang }) -> Promise<{ token, key, url, expiresAt }>, uploadAsset(kind: 'gif' | 'video', blob: Blob) -> Promise<void>, current() -> { token, key, url } | null, reset() }`.
    - `ensureResult` mengunggah sekali per objek `File`. File yang sama → hasil yang sama di-cache; file baru → hasil baru.
    - `uploadAsset` menunggu `ensureResult` selesai bila sedang berjalan.
    - Setelah `reset()`, janji yang masih berjalan diselesaikan tapi hasilnya dibuang (versi naik), dan `current()` mengembalikan `null`.
    - `api` dapat disuntik: `{ createResult(formData), putAsset(token, key, kind, blob) }`.
  - Instans tunggal `ctx.share`, dibuat di `main.js`. `ctx.onReset(() => ctx.share.reset())`.
  - `ctx.session.consent: boolean` (false setelah `resetSession`).

- [ ] **Step 1: Tulis tes yang gagal** `test/share-state.test.js` dengan `api` palsu yang janjinya diselesaikan manual:
  - Dua `ensureResult(sameFile)` berurutan → `createResult` dipanggil sekali.
  - `ensureResult(fileB)` setelah `fileA` → dipanggil dua kali.
  - `reset()` saat `createResult` belum selesai, lalu janji diselesaikan → `current() === null`.
  - `uploadAsset('gif', b)` sebelum `ensureResult` selesai → `putAsset` dipanggil setelahnya dengan token yang benar.
- [ ] **Step 2:** `node --test test/share-state.test.js` → FAIL.
- [ ] **Step 3: Implementasikan dan pasang UI.**
  - Panel `#share-panel` di layar Hasil dengan tombol **QR**. Bila `ctx.session.consent` belum true, muncul `<dialog id="consent-dialog">` berisi teks persetujuan i18n ("Foto disimpan di server selama 7 hari agar bisa dikirim ke kamu.") dan tombol Setuju/Batal.
  - Setelah setuju: `ensureResult(ctx.result.current().file, { templateId, lang: getLang() })`, lalu tampilkan `<img src="/api/results/<token>/qr.svg">` besar dan URL pendek.
  - Status "Mengunggah…". Error 507 → teks i18n penyimpanan penuh; error lain → teks gagal dengan tombol coba lagi.
  - Bila `ctx.visit()` berubah sebelum respons datang, abaikan.
  - `expireSession`, Sesi baru, dan Ulang sesi menutup dialog serta mengosongkan panel (lewat `ctx.onReset`).
  - Kembali ke Atur lalu Lanjut membuat `File` baru, sehingga QR berikutnya membuat hasil baru.
  - **Bagikan** (Web Share) hanya bila kiosk mati dan `(pointer: coarse)` cocok.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser dengan kamera palsu:
  - Sesi penuh → QR → setuju → QR tampil → buka URL di tab baru → foto tampil.
  - **Reset saat unggah:** kiosk aktif dengan idle 30 dtk; tahan respons `POST /api/results` lewat CDP Fetch; biarkan idle hingga reset; lepaskan respons → layar sambutan tanpa QR, dan sesi berikutnya tidak menampilkan QR lama.
  - 390/1440, id/en, tanpa error konsol atau CSP.
- [ ] **Step 5: Commit** `feat: QR sharing with consent on the result screen`.

---

# TAHAP 3 — Pengiriman email dan WhatsApp

### Task 3.1: Modul kontak

**Files:**
- Create: `public/js/contact.js`
- Test: `test/contact.test.js`

**Interfaces:**
- Produces: `normalizePhone(input: string) -> string | null`, `isValidEmail(input: string) -> boolean`, `normalizeEmail(input: string) -> string` (trim + huruf kecil), `maskEmail(email) -> string`, `maskPhone(phone) -> string`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `normalizePhone`:
    - `'0812-3456-7890'` → `'6281234567890'`
    - `'+62 812 3456 7890'` → `'6281234567890'`
    - `'6281234567890'` → sama
    - `'08123'` → `null`, `'abc'` → `null`, `''` → `null`
    - `'+1 415 555 2671'` → `'14155552671'`
  - `normalizeEmail(' Rina@Gmail.com ')` → `'rina@gmail.com'`
  - `isValidEmail`:
    - `'rina@gmail.com'` → true
    - `'rina@gmail'`, `'ri na@gmail.com'`, `'@gmail.com'` → false
    - 255 karakter → false
  - `maskEmail('rina.putri@gmail.com')` → `'ri***@gmail.com'`, `maskEmail('a@x.co')` → `'a***@x.co'`
  - `maskPhone('6281234567890')` → `'6281****7890'`
- [ ] **Step 2:** `node --test test/contact.test.js` → FAIL.
- [ ] **Step 3: Implementasikan** sesuai §4.2.
- [ ] **Step 4:** `node --test test/contact.test.js` → PASS.
- [ ] **Step 5: Commit** `feat: shared contact normalization and masking`.

### Task 3.2: Pengirim email dan WhatsApp

**Files:**
- Create: `lib/mailer.js`, `lib/whatsapp.js`
- Modify: `config.js` (`mail` dan `whatsapp`), `.env.example`
- Test: `test/mailer.test.js`, `test/whatsapp.test.js`, `test/config.test.js`

**Interfaces:**
- Produces:
  - `loadConfig()` menambahkan:
    - `mail: { host, port: number, user, pass, from, transport: 'smtp' | 'json' } | null`. Bila `MAIL_TRANSPORT=json`, nilainya `{ transport: 'json', from: 'photobooth@localhost' }` tanpa SMTP. Selain itu `null` kecuali keempat `SMTP_*` wajib terisi.
    - `whatsapp: { phoneNumberId, token, template, lang, apiBase } | null` (null kecuali keempat `WA_*` wajib terisi).
  - `createMailer(mail, { transport } = {}) -> { send({ to, lang, pageUrl, photoPath }): Promise<void>, sendTest(to): Promise<void> }`.
    - Memakai `nodemailer.createTransport(...)`: port 465 → `secure: true`, `transport: 'json'` → `{ jsonTransport: true }`.
    - Subjek id "Foto photobooth kamu 📸", en "Your photobooth photos 📸".
    - Foto sebagai lampiran (`cid` inline), tombol link ke `pageUrl`, dan versi teks.
  - `createWhatsApp(wa, { fetch = globalThis.fetch } = {}) -> { send({ to, photoUrl, pageUrl }): Promise<void> }`.
    - `POST ${apiBase}/${phoneNumberId}/messages` dengan `Authorization: Bearer <token>` dan body:
      `{ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: lang }, components: [{ type: 'header', parameters: [{ type: 'image', image: { link: photoUrl } }] }, { type: 'body', parameters: [{ type: 'text', text: pageUrl }] }] } }`
    - Respons non-2xx → melempar `Error` dengan pesan berisi status, tanpa token.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `config`:
    - Tanpa env → `mail === null`, `whatsapp === null`.
    - Keempat `SMTP_*` → `mail.from === SMTP_USER`.
    - `MAIL_TRANSPORT=json` → `mail.transport === 'json'`.
    - Keempat `WA_*` → `apiBase === 'https://graph.facebook.com/v21.0'`.
  - `mailer` dengan `transport: 'json'` dan transport yang merekam: `send({ lang: 'en', ... })` → subjek "Your photobooth photos 📸", satu lampiran, dan HTML memuat `pageUrl`. `lang: 'id'` → subjek Indonesia.
  - `whatsapp` dengan `fetch` palsu: URL, header Authorization, dan body JSON persis seperti di atas. Respons 400 → reject dengan pesan memuat `400` dan tidak memuat token.
- [ ] **Step 2:** `node --test test/config.test.js test/mailer.test.js test/whatsapp.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Tambahkan juga semua env baru ke `.env.example` dengan komentar singkat.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: SMTP mailer and WhatsApp Cloud API sender`.

### Task 3.3: Antrean kiriman dan endpoint kirim

**Files:**
- Create: `lib/delivery-queue.js`
- Modify: `routes/results.js`, `routes/settings.js`, `server.js`
- Test: `test/delivery-queue.test.js`, `test/results-api.test.js`, `test/settings.test.js`

**Interfaces:**
- Consumes: `createMailer`, `createWhatsApp` (3.2), store (2.1), `normalizePhone`/`normalizeEmail`/`isValidEmail`/`mask*` (3.1)
- Produces:
  - `createDeliveryQueue({ db, store, senders: { email?: { send }, whatsapp?: { send } }, now = () => new Date() }) -> { enqueue(resultRow, channel, recipient) -> number, countFor(resultId) -> number, tick() -> Promise<void>, recover() -> void, start(intervalMs = 3000) -> void, stop() -> void, stats7d() -> { sent, failed } }`.
    - `tick()` mengambil ≤ 2 baris `queued` dengan `next_attempt_at <= now`, lalu mengirim:
      - email: `send({ to, lang, pageUrl, photoPath })`
      - whatsapp: `send({ to, photoUrl: base_url + '/r/' + token + '/photo.jpg', pageUrl })`
    - Status dan backoff mengikuti §4.1.
  - `POST /api/results/:token/send` dan `GET /api/results/:token/deliveries` sesuai §3.2:
    - Validasi kontak lebih dulu (422).
    - `services[channel]` false → 409.
    - `countFor >= 3` → 429.
    - Batas laju `DELIVERY_LIMIT`.
  - `createApp({ ..., senders })`: secara default membuat pengirim dari `config.mail`/`config.whatsapp`. Tes menyuntikkan pengirim palsu. `services = { email: Boolean(senders.email), whatsapp: Boolean(senders.whatsapp) }`.
  - `GET /api/settings` ditambah `share_email` dan `share_whatsapp`.
  - Saat start: `recover()`, lalu `start()` bila `NODE_ENV !== 'test'`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `delivery-queue` dengan jam palsu dan pengirim palsu:
    - Sukses → `sent`, `recipient IS NULL`, `recipient_masked` terisi.
    - Gagal, gagal, sukses: dua `tick()` pertama gagal dengan `next_attempt_at` +30 dtk lalu +120 dtk (jam dimajukan di antaranya), lalu `sent` dengan `attempts === 3`.
    - Selalu gagal → `failed` setelah 3 percobaan dengan `recipient IS NULL`.
    - Baris `sending` + `recover()` → `queued`.
    - `stats7d()` menghitung `sent` dan `failed`.
  - `results-api`:
    - `send` email dengan kunci benar → 202, lalu `deliveries` → `[{ channel: 'email', to: 'ri***@gmail.com', status: 'queued' }]`.
    - Kunci salah → 403. Email tidak valid → 422.
    - WhatsApp ketika tidak dikonfigurasi → 409.
    - Kiriman ke-4 → 429. Dua `send` serentak dengan sisa kuota 1 → tepat satu 202.
  - `settings`: `GET /api/settings` dengan pengirim email palsu → `share_email: true`, `share_whatsapp: false`. Nilai SMTP tidak muncul di JSON.
- [ ] **Step 2:** `node --test test/delivery-queue.test.js test/results-api.test.js test/settings.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Cek kuota dan sisipkan baris dalam satu transaksi SQLite, supaya permintaan serentak tidak melewati batas 3.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: delivery queue with retries for email and WhatsApp`.

### Task 3.4: Kirim dari booth dan layar kontak di awal

**Files:**
- Create: `public/js/booth/screens/contact.js`
- Modify: `public/js/booth/share.js` (+`send`, `deliveries`), `public/js/booth/screens/result.js`, `public/js/booth/screens/welcome.js`, `public/js/booth/main.js`, `public/booth.html`, `public/css/booth.css`, kamus i18n
- Test: `test/share-state.test.js`

**Interfaces:**
- Consumes: `normalizePhone`, `isValidEmail`, `normalizeEmail` (3.1); API 3.3; `ctx.settings.share_email`/`share_whatsapp`/`contact_before`
- Produces:
  - `share.send(channel, to) -> Promise<{ id }>` (memanggil `ensureResult` lebih dulu)
  - `share.deliveries() -> Promise<Array<{ id, channel, to, status }>>`
  - `ctx.session.contact = { email: string | null, phone: string | null }`
  - Layar `contact` terdaftar di `SCREENS`. Welcome menuju `contact` bila `contact_before === 1` dan minimal satu layanan aktif; selain itu langsung ke `pick`.

- [ ] **Step 1: Tulis tes yang gagal** di `test/share-state.test.js`:
  - `send('email', x)` sebelum ada hasil → `createResult` lalu `postSend` dipanggil berurutan.
  - `reset()` di antaranya → `postSend` tidak dipanggil.
- [ ] **Step 2:** `node --test test/share-state.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.**
  - **Panel Hasil:** form Email (bila `share_email`) dan WhatsApp (bila `share_whatsapp`) dengan validasi di klien memakai teks i18n. Tombol terkunci selama request. Status dari `deliveries()` di-polling setiap 2000 ms selama ada `queued`/`sending`, maksimal 2 menit, dengan tampilan "Sedang dikirim…" / "Terkirim ✓" / "Gagal mengirim" + tombol coba lagi. Error 429 → pesan batas kiriman. Persetujuan memakai dialog yang sama dengan 2.4.
  - **Layar `contact`** sesuai §2.1: isian, centang persetujuan, Lanjut/Lewati. Lanjut menyimpan `ctx.session.contact` dan `ctx.session.consent = true`, lalu `go('pick', { mode: 'start' })`.
  - **Kirim otomatis:** di layar Hasil, setelah `prepareResult` berhasil dan `ctx.session.contact` terisi, panggil `share.send` untuk tiap kontak sekali (tandai sudah dikirim per `File`), lalu tampilkan statusnya di panel.
  - **Reset** (`ctx.onReset`) membersihkan isian, status, dan timer polling.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser: server terisolasi dengan `MAIL_TRANSPORT=json` dan `WA_*` mengarah ke server HTTP tiruan lokal (`WA_API_BASE=http://127.0.0.1:<port>`) yang mencatat request.
  - **Kontak di awal:** `contact_before=1` → isi email + nomor → sesi → di layar Hasil keduanya "Terkirim ✓". Log server menunjukkan email json dan server tiruan menerima template.
  - **Kirim dari panel:** tanpa kontak awal, isi email di panel → Terkirim. Ketuk Kirim dua kali cepat → hanya satu baris `deliveries` baru.
  - **SMTP salah:** jalankan server dengan `SMTP_*` palsu (host `127.0.0.1`, port tertutup) → status berakhir "Gagal mengirim" dalam ≤ 3 percobaan (majukan dengan jeda pendek lewat env khusus tes bila perlu, atau periksa DB setelah 3 menit).
  - 390/1440, id/en.
- [ ] **Step 5: Commit** `feat: send results by email and WhatsApp from the booth`.

---

# TAHAP 4 — GIF stop-motion

### Task 4.1: GIF dari foto sesi

**Files:**
- Create: `public/vendor/gifenc.js` (salinan ESM `gifenc` dari npm, versi terbaru, ditambah header lisensi MIT), `public/vendor/LICENSE-gifenc.txt`, `public/js/media/gif.js`, `public/js/media/gif-worker.js`
- Modify: `public/js/booth/screens/result.js` (tab Foto | GIF), `public/booth.html`, `public/css/booth.css`, kamus i18n
- Test: `test/gif-plan.test.js`

**Interfaces:**
- Consumes: `geometry.photoRect`, `clampTransform`, `filteredCanvas`, `share.uploadAsset` (2.4)
- Produces:
  - `planGifFrames(template, photos, transforms, maxSide = 640) -> Array<{ slot: number, w: number, h: number, dx: number, dy: number, dw: number, dh: number }>`.
    - Satu entri per slot berfoto.
    - `k = maxSide / max(slot.w, slot.h)`, `w = round(slot.w·k)`, `h = round(slot.h·k)`.
    - `r = photoRect(photo.width, photo.height, slot, clampTransform(transform, …))`, lalu `dx = (r.x − slot.x)·k`, `dy = (r.y − slot.y)·k`, `dw = r.w·k`, `dh = r.h·k`.
  - `buildGif({ template, photos, transforms, filter }) -> Promise<Blob>` (`image/gif`). Menggambar tiap bingkai ke canvas `w×h` dengan latar `template.bg_color`, lalu mengirim `ImageData` ke worker.
  - Worker menerima `{ frames: [{ width, height, data }], delay: 600 }` dan membalas `{ ok: true, buffer }` atau `{ ok: false, error }`. Kuantisasi 256 warna per bingkai dengan `repeat: 0`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - Template `TEST_TEMPLATE` (slot 280×180), foto 192×108, transform default → `w = 640`, `h = 411` (`round(180·640/280)`); `dw/dh` sama dengan `photoRect` × k; slot tanpa foto dilewati.
  - Slot potret 180×280 → `h = 640`.
- [ ] **Step 2:** `node --test test/gif-plan.test.js` → FAIL.
- [ ] **Step 3: Implementasikan dan pasang.**
  - Tab **Foto | GIF** di layar Hasil, dengan GIF dibuat saat masuk Hasil (indikator i18n).
  - Token versi: perubahan foto, transform, atau filter membatalkan hasil lama dan melepas object URL.
  - Unduh pada tab GIF → `photobooth-<waktu>.gif`. Tombol **Bagikan** (Web Share, 2.4) membagikan GIF bila tab GIF aktif.
  - Bila hasil server sudah ada, atau saat dibuat kemudian, unggah GIF lewat `share.uploadAsset('gif', blob)`.
  - Kegagalan worker → teks i18n "GIF tidak bisa dibuat" tanpa menghentikan tab Foto.
  - Worker dibuat dengan `new Worker('/js/media/gif-worker.js', { type: 'module' })`.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser: sesi 3 foto → tab GIF menampilkan animasi 3 bingkai berukuran ≤ 640 px. Unduh GIF berhasil dan diawali `GIF89a`. QR → halaman hasil menampilkan GIF. Ubah filter di Atur → GIF dibuat ulang. Tidak ada error CSP untuk worker.
- [ ] **Step 5: Commit** `feat: stop-motion GIF built in a web worker`.

---

# TAHAP 5 — Video sesi

### Task 5.1: Rekam video sesi

**Files:**
- Create: `public/js/media/recorder.js`
- Modify: `public/js/booth/screens/shoot.js`, `public/js/booth/screens/review.js`, `public/js/booth/screens/result.js` (tab Video), `public/js/booth/main.js` (`ctx.recorder`), `public/booth.html`, `public/css/booth.css`, kamus i18n
- Test: `test/recorder.test.js`

**Interfaces:**
- Consumes: `isMirrored()` (1.2), `share.uploadAsset('video', blob)` (2.4), `ctx.settings.video_enabled`
- Produces:
  - `VIDEO_MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']`
  - `pickVideoMime(isTypeSupported: (m) => boolean) -> { mime: string, ext: 'mp4' | 'webm' } | null`
  - `canRecord(win = globalThis) -> boolean`: membutuhkan `MediaRecorder`, `HTMLCanvasElement.prototype.captureStream`, dan `pickVideoMime` ≠ null.
  - `createSessionRecorder({ video: HTMLVideoElement, mirror: () => boolean, maxMs = 90000, fps = 24, maxSide = 1280 }) -> { start(), pause(), resume(), setOverlay({ count: number | null, flash: boolean }), stop(): Promise<{ blob: Blob, ext } | null>, discard(), active(): boolean }`
  - `ctx.recorder`: `null` atau perekam sesi aktif. Dibuang di `ctx.onReset`.
  - `ctx.session.video = { blob, ext } | null`

- [ ] **Step 1: Tulis tes yang gagal.**
  - `pickVideoMime(m => m === 'video/webm;codecs=vp8')` → `{ mime: 'video/webm;codecs=vp8', ext: 'webm' }`.
  - `pickVideoMime(m => m.startsWith('video/mp4'))` → `{ mime: 'video/mp4;codecs=avc1', ext: 'mp4' }`.
  - `pickVideoMime(() => false)` → `null`.
  - `canRecord({})` → `false` (tanpa `MediaRecorder`).
- [ ] **Step 2:** `node --test test/recorder.test.js` → FAIL.
- [ ] **Step 3: Implementasikan dan pasang.**
  - Perekam menggambar dengan `requestAnimationFrame` yang dibatasi ke `fps`. Canvas berukuran sisi panjang `maxSide`, dicermin sesuai `mirror()`, dengan overlay angka hitung mundur (font display, outline) dan kilatan putih 150 ms. Perekaman memakai `MediaRecorder` dengan bitrate `2_500_000`, tanpa audio. Timer `maxMs` memanggil `stop()` sendiri.
  - **Layar Berpose:**
    - Bila `video_enabled === 1 && canRecord()`, buat perekam di awal `runSequence` pertama sesi dan panggil `start()`. Indikator `#rec-badge` ("● REC").
    - `setOverlay` dipanggil setiap detik hitung mundur dan saat kilatan.
    - Batal → `discard()`.
    - Setelah foto terakhir → `stop()`, lalu simpan ke `ctx.session.video`.
  - **Tinjau:** `pause()` di `enter` dan `resume()` di `leave` bila kembali memotret.
  - **Ulang sesi, Sesi baru, dan reset kiosk:** `discard()`.
  - **Layar Hasil:**
    - Tab Video (hanya bila `ctx.session.video`) dengan `<video controls playsinline loop muted>` dari object URL.
    - Unduh `photobooth-<waktu>.<ext>`.
    - Unggah lewat `share.uploadAsset('video', blob)`. Error 413 → teks i18n bahwa video terlalu besar untuk dikirim; foto dan GIF tetap jalan.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser dengan kamera palsu dan `video_enabled=1`:
  - Sesi 3 foto dengan review 3 dtk → tab Video memutar klip berisi angka hitung mundur. Durasi kira-kira sama dengan waktu memotret, tanpa waktu tinjau (bandingkan dengan `video.duration`).
  - Cermin mati → video tidak dicermin.
  - QR → halaman hasil memutar video.
  - Batal di tengah lalu mulai lagi → klip baru, bukan sambungan.
  - `video_enabled=0` → tidak ada `#rec-badge` dan tidak ada tab Video.
  - Tidak ada error konsol.
- [ ] **Step 5: Commit** `feat: optional session video recording`.

---

# TAHAP 6 — Admin, dokumentasi, dan uji akhir

### Task 6.1: Admin Hasil & Kirim

**Files:**
- Create: `routes/admin-results.js`
- Modify: `server.js`, `public/admin/settings.html`, `public/admin/pages/settings.js`, `public/admin/dashboard.html`, `public/admin/pages/dashboard.js`, `public/css/admin.css`
- Test: `test/admin-results.test.js`

**Interfaces:**
- Consumes: store (2.1), queue (3.3), mailer (3.2)
- Produces, dipasang di `/api/admin/results` dan `/api/admin/test-email`:
  - `GET /api/admin/results/summary` → `{ count, bytes, disk_total, disk_free, deliveries_7d: { sent, failed }, services: { email, whatsapp } }`
  - `DELETE /api/admin/results` → 204
  - `POST /api/admin/test-email { to }` → 204. Email tidak valid → 422. Email tidak aktif → 409. Error SMTP → 502 `{ error }`, dengan pesan yang tidak memuat `SMTP_PASS`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - Tanpa login → 401 untuk ketiganya.
  - `summary` setelah 2 hasil dibuat → `count: 2`, `bytes > 0`.
  - `DELETE` → `count: 0` dan folder kosong.
  - `test-email` dengan mailer palsu → 204 dan `sendTest` dipanggil dengan alamat yang dinormalisasi.
  - `test-email` dengan mailer yang melempar `Error('Invalid login: 535 … pass=rahasia')` → 502, dan body tidak memuat `rahasia`.
- [ ] **Step 2:** `node --test test/admin-results.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.**
  - **Pengaturan → grup Hasil & Kirim:**
    - Status Email/WhatsApp ("Aktif ✓" / "Belum diatur").
    - Form kirim email uji.
    - Pemakaian penyimpanan ("142 hasil · 310 MB dari 1 GB").
    - Tombol Hapus semua hasil dengan `confirm`.
    - Keterangan masa simpan 7 hari.
  - **Dashboard:** kartu "Kiriman 7 hari" menampilkan berhasil/gagal.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser: login admin, pengaturan menampilkan status layanan, email uji memakai `MAIL_TRANSPORT=json` (204), dan hapus semua bekerja.
- [ ] **Step 5: Commit** `feat: admin results storage, service status and test email`.

### Task 6.2: Dokumentasi dan uji akhir

**Files:**
- Modify: `README.md`, `docs/manual-test.md`, `fly.toml` (komentar `min_machines_running` saat acara)

- [ ] **Step 1: README.** Tambahkan bagian:
  - **Kirim hasil:** cara membuat App Password Gmail (aktifkan verifikasi 2 langkah → Akun Google → Keamanan → Sandi aplikasi), contoh `fly secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=… SMTP_PASS=…`, dan batas sekitar 500 email per hari.
  - **WhatsApp Cloud API:** buat aplikasi di Meta for Developers → produk WhatsApp → nomor bisnis → template kategori *utility* dengan header gambar dan satu variabel body untuk link → `WA_*` secrets.
  - **Privasi:** masa simpan 7 hari dan persetujuan tamu.
- [ ] **Step 2: Uji akhir di browser** (kamera palsu, server terisolasi dengan `MAIL_TRANSPORT=json` dan WhatsApp tiruan, `video_enabled=1`, `contact_before=1`):
  - Kontak di awal → sesi penuh → Hasil: tab Foto/GIF/Video, email dan WhatsApp "Terkirim ✓", QR → halaman hasil menampilkan ketiga file.
  - Kiosk: reset menganggur saat panel QR terbuka → sambutan bersih.
  - Cermin aktif/mati.
  - 390/820/1440, terang/gelap, id/en.
  - Tidak ada error konsol atau CSP.
  - Catat hasilnya sebagai tabel di laporan.
- [ ] **Step 3: `docs/manual-test.md`.** Tambahkan baris:
  - email ke Gmail sungguhan (dan cek folder spam);
  - WhatsApp sungguhan setelah template disetujui;
  - scan QR dengan HP;
  - video di iPhone Safari dan Chrome Android;
  - GIF di HP lama;
  - kiriman saat mesin Fly baru menyala dari keadaan berhenti.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `docs: sharing setup, privacy notes and test checklist`.
- [ ] **Step 6: Serah terima deploy.** Jangan deploy sendiri. Laporkan ke controller bahwa deploy ke Fly menunggu pemilik mengisi `SMTP_*` (dan opsional `WA_*`) dengan `fly secrets set`.
