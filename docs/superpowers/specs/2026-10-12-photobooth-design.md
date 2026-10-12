# Photobooth Digital Berbasis Browser — Desain

Tanggal: 2026-10-12
Status: final (disetujui setelah tinjauan spec)

## 1. Tujuan dan cakupan

Photobooth di browser: pengguna memilih template, mengambil foto dengan kamera (atau mengunggah dari galeri), mengatur posisi foto di slot, memilih filter, lalu mengunduh photostrip. Admin mengelola template, pengaturan global, dan melihat statistik pemakaian.

**Tujuan pemakaian:**
- dipakai sungguhan di acara (tablet atau laptop sebagai booth), jadi keandalan lebih penting daripada fitur tambahan
- menjadi produk publik yang terus dikembangkan, jadi struktur harus siap untuk fitur lanjutan

Belum ada tanggal acara, jadi target satu hari adalah fondasi yang benar. Pekerjaan yang meluber ke hari kedua tidak menjadi masalah.

**Kriteria sukses:**
- Satu sesi penuh (pilih template → foto → atur → unduh) berjalan di Chrome laptop dengan webcam bawaan, webcam USB, Chrome Android, dan Safari iPhone/iPad.
- Admin bisa mengunggah, mencoba, dan mengaktifkan template baru.

**Keputusan dasar:**
- Pengguna tidak punya akun. Alurnya pakai lalu unduh.
- Hanya admin yang membuat template.
- Foto pengguna tidak pernah dikirim ke server. Server hanya menyimpan template, thumbnail, pengaturan, dan log sesi.
- Antarmuka berbahasa Indonesia.

**Di luar cakupan (pengembangan lanjutan):**
- pembayaran, ranking kreator, peran kreator untuk user, akun dan galeri pengguna
- QR code unduhan, cetak langsung, manajemen perangkat, kode khusus per acara
- stiker yang bisa digeser, GIF atau boomerang
- editor slot visual (menggambar kotak) dan halaman ganti password
- reset otomatis saat booth menganggur, cache offline lewat service worker
- deploy multi-instance

## 2. Teknologi

- Node.js + Express, **ESM di seluruh proyek** (`"type": "module"`), sehingga modul murni di `public/js/` bisa diimpor server.
- SQLite lewat better-sqlite3 (`journal_mode = WAL`, `busy_timeout`).
- multer untuk unggahan, bcrypt, express-session dengan `better-sqlite3-session-store`, express-rate-limit, helmet.
- Frontend: HTML, CSS, dan JavaScript vanilla dengan ES modules, tanpa build tool.
- Tes: `node:test` + `supertest`.

## 3. Arsitektur dan struktur

Alur pengguna adalah **satu halaman** (`index.html`) yang berisi beberapa layar, sehingga stream kamera dan foto tetap ada di memori saat berpindah layar. Halaman admin dibuat terpisah.

```
package.json             → "type": "module", skrip start/test/seed/backup
.gitignore               → node_modules, .env, data, uploads, backups, *.db, *.db-wal, *.db-shm
.env.example             → contoh env (di-commit; .env tidak)
README.md                → env, seed, backup, deploy (lihat bagian 15)
server.js                → Express: helmet, session, static, routes, error handler, SIGTERM
config.js                → baca dan validasi env (gagal cepat)
db/index.js              → koneksi, pragma, migrasi tabel (idempotent)
db/seed-admin.js         → buat admin / --reset password
db/seed-sample.js        → template contoh untuk pengembangan dan fixture tes
storage/index.js         → save, remove, urlFor (versi disk lokal); simpan berpasangan dengan rollback
routes/auth.js           → login, logout, me + rate limit
routes/templates.js      → publik: daftar dan detail | admin: CRUD, status
routes/stats.js          → publik: catat sesi | admin: ringkasan
routes/settings.js       → publik: baca | admin: ubah (whitelist)
middleware/requireAdmin.js
middleware/checkOrigin.js
lib/image-header.js      → cek tanda tangan PNG/JPEG dan baca dimensi dari header
lib/time.js              → batas awal/akhir "hari ini" menurut TZ (Intl), dalam UTC
scripts/backup.js        → db.backup() + salin uploads ke backups/<tanggal>/
public/
  index.html, css/app.css
  js/app.js              → perpindahan layar dan alur
  js/state.js            → state sesi
  js/camera.js           → getUserMedia, kamera, capture
  js/strip.js            → render photostrip
  js/geometry.js         → cover, batas pan, konversi koordinat (murni)
  js/filters.js          → matriks warna (murni) + penerapan ke ImageData
  js/slots.js            → validasi slot (murni, dipakai bersama server)
  js/detect-slots.js     → deteksi slot dari array alpha (murni)
  js/api.js              → fetch helper
  admin/login.html, dashboard.html, template-edit.html, admin.js
docs/manual-test.md      → checklist uji lintas perangkat
test/                    → tes node:test + supertest; helpers.js (createApp dengan DB :memory:), fixtures/
lib/http-error.js        → HttpError(status, message), dipetakan oleh error handler
```

`server.js` mengekspor `createApp({ config, db, storage, now })` dan hanya memanggil `listen` bila dijalankan langsung, sehingga tes bisa membangun app tanpa membuka port.

## 4. Konfigurasi

| Env | Default | Keterangan |
|---|---|---|
| `PORT` | 3000 | |
| `DB_PATH` | `./data/photobooth.db` | Harus berada di disk persisten |
| `UPLOAD_DIR` | `./uploads` | Template di `<UPLOAD_DIR>/templates`; harus berada di disk persisten |
| `SESSION_SECRET` | — | Wajib di produksi |
| `TZ` | `Asia/Jakarta` | Dipakai untuk menghitung "sesi hari ini" |
| `NODE_ENV` | `development` | |

**Aturan gagal cepat:** saat `NODE_ENV=production`, server menolak berjalan jika `SESSION_SECRET` kosong atau masih sama dengan nilai di `.env.example`. Di produksi, `trust proxy` aktif dan cookie sesi `secure`.

**Shutdown:** saat menerima SIGTERM atau SIGINT, server berhenti menerima koneksi lalu menutup database dengan rapi.

## 5. Database

```
users        id, username UNIQUE, password_hash, role ('admin'), created_at
templates    id, name, image_path, thumb_path, canvas_w, canvas_h,
             slots_json      -- [{x,y,w,h}] piksel asli template, urutan = urutan pengambilan
             photo_count     -- = jumlah slot, dihitung server
             bg_color        DEFAULT '#ffffff'
             status          ('active'|'inactive'|'archived') DEFAULT 'inactive'
             created_at, updated_at
session_logs id, template_id → templates.id, photo_count, created_at
settings     key PRIMARY KEY, value
sessions     (dikelola session store)
```

**Pragma** (diatur di `db/index.js` setiap koneksi dibuka): `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout`.

**Aturan data:**
- Semua waktu disimpan sebagai string ISO 8601 UTC.
- Indeks dibuat pada `session_logs(created_at)` dan `session_logs(template_id)`.
- Pengaturan yang dikenal (whitelist):
  - `countdown_seconds`: bilangan bulat 1–10, default 3
  - `mirror_output`: 0 atau 1, default 0

**Status template:**
- `inactive`: disembunyikan dari pengguna, bisa diedit dan diaktifkan.
- `active`: tampil ke pengguna.
- `archived`: dihapus tanpa menghilangkan data; log dan statistik lama tetap utuh.
- Template baru selalu `inactive`.

## 6. Validasi template (dipakai bersama di `slots.js` dan server)

- **Ukuran kanvas:** setiap sisi 1–4000 px, dan `canvas_w × canvas_h ≤ 12.000.000`. Batas ini berada di bawah batas canvas Safari iOS (sekitar 16,7 juta piksel).
- **Slot:**
  - Jumlahnya 1–8.
  - Setiap nilai adalah bilangan bulat; `w` dan `h` > 0.
  - Slot harus berada sepenuhnya di dalam kanvas. Pelanggaran adalah **error** yang memblokir simpan dan aktivasi.
  - Slot yang tumpang tindih hanya **peringatan**; tidak memblokir.
- **File PNG template:**
  - Maksimal 5 MB, dibatasi lewat `limits.fileSize` di multer.
  - 8 byte tanda tangan PNG harus cocok.
  - Dimensi dibaca dari IHDR dan harus sama dengan `canvas_w` dan `canvas_h`.
- **Thumbnail:**
  - JPEG dengan tanda tangan `FF D8 FF`.
  - Sisi maksimal 600 px, file maksimal 300 KB.
  - Dimensi dibaca dari marker SOF.
- **Aktivasi** (`PATCH status → active`) ditolak dengan 422 jika slot kosong atau tidak valid.

## 7. API

Semua error berbentuk `{ "error": "pesan" }`.

**Publik**

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/templates` | Hanya template `active`: id, name, image_url, thumb_url, canvas_w, canvas_h, slots, bg_color |
| GET | `/api/templates/:id` | Detail; 404 jika tidak `active` |
| GET | `/api/settings` | `countdown_seconds`, `mirror_output` |
| POST | `/api/sessions` | Body `{ template_id }` saja. Template harus `active`; `photo_count` diisi server. Rate limit 120 per 10 menit per IP (konstanta `SESSION_LOG_LIMIT`), karena semua tamu di satu booth berbagi IP yang sama |
| GET | `/healthz` | Health check |

Respons tidak pernah memuat `image_path` atau `thumb_path`. Hanya URL yang dibentuk lewat `storage.urlFor`.

**Admin** (`requireAdmin` + `checkOrigin` untuk method yang mengubah data, `Cache-Control: no-store`)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Rate limit 5 per 15 menit per IP, dengan header `Retry-After` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | 401 jika belum login |
| GET | `/api/admin/templates` | Semua status, termasuk jumlah pemakaian |
| POST | `/api/admin/templates` | Multipart: `image` (PNG), `thumb` (JPEG), `name`, `canvas_w`, `canvas_h`, `slots`, `bg_color` |
| PUT | `/api/admin/templates/:id` | `image` opsional. `thumb` **wajib** bila PNG, slot, atau `bg_color` berubah (tanpa itu: 422) |
| PATCH | `/api/admin/templates/:id/status` | `active` / `inactive` / `archived` |
| DELETE | `/api/admin/templates/:id` | Hapus permanen beserta file; 409 jika template sudah punya log sesi |
| GET | `/api/admin/stats` | Jumlah template per status, sesi hari ini, 5 terpopuler sepanjang waktu |
| PUT | `/api/admin/settings` | Hanya kunci yang ada di whitelist; selainnya 400 |

**Aturan PUT:**
- Urutan: validasi semua input (slot divalidasi terhadap ukuran PNG baru jika ada) → simpan file baru → update database → hapus file lama.
- Jika langkah mana pun gagal, tidak ada yang berubah dan file baru dihapus.
- Perubahan PNG atau slot mengubah status kembali ke `inactive`. Perubahan nama atau `bg_color` tidak mengubah status.

**Pemetaan error:**

| Kondisi | Status |
|---|---|
| `LIMIT_FILE_SIZE` dari multer | 413 |
| Tipe atau tanda tangan file salah | 400 |
| Kunci pengaturan tidak dikenal | 400 |
| Validasi gagal | 422 |
| Template sudah punya log sesi saat dihapus | 409 |
| Belum login | 401 |
| Origin tidak cocok | 403 |
| Lainnya | 500, pesan umum, tanpa stack trace di produksi |

File sementara multer selalu dihapus jika validasi gagal.

**"Sesi hari ini":** `lib/time.js` menghitung awal dan akhir hari menurut `TZ` lalu mengubahnya ke UTC ISO. Query memakai `created_at >= ? AND created_at < ?` sehingga indeks tetap terpakai.

## 8. Penyimpanan file (`storage/`)

- Fungsi `save(buffer|tmpPath, ext) → key`, `remove(key)`, dan `urlFor(key)`.
- Nama file selalu acak (`crypto.randomUUID()`).
- `savePair(image, thumb)`: kalau salah satu gagal, file yang sudah tersimpan dihapus, sehingga hasilnya keduanya tersimpan atau tidak sama sekali.
- `server.js` menyajikan `<UPLOAD_DIR>/templates` di `/uploads/templates` dengan ketentuan:
  - hanya file `.png` dan `.jpg`
  - tanpa daftar isi folder
  - `Cache-Control: public, max-age=31536000, immutable` (aman karena setiap penggantian menghasilkan nama baru)

## 9. Keamanan

**Password dan akun**
- Password di-hash dengan bcrypt.
- Saat username tidak ditemukan, server tetap menjalankan `bcrypt.compare` dengan hash palsu, supaya waktu respons tidak membocorkan username yang valid.
- Pesan login gagal selalu umum.
- Akun admin dibuat dan direset lewat skrip, tidak ada pendaftaran publik:
  - `node db/seed-admin.js <user> <pass>`
  - `node db/seed-admin.js --reset <user> <pass>`

**Sesi dan request**
- Cookie sesi: `httpOnly`, `sameSite=lax`, dan `secure` di produksi.
- Session store memakai SQLite.
- `checkOrigin`: request POST/PUT/PATCH/DELETE ke API admin harus membawa header `Origin` yang host-nya sama dengan host request (dihitung setelah `trust proxy`). Jika tidak, ditolak dengan 403.
- Rate limit memakai IP asli (`trust proxy`).

**Header**
- helmet dengan CSP: `default-src 'self'`; `img-src` dan `media-src` mengizinkan `'self' blob: data:`.
- `Permissions-Policy: camera=(self), fullscreen=(self)` diatur sendiri.

**Frontend admin:** render hanya lewat `textContent` atau pembuatan elemen, tidak pernah `innerHTML` dengan data dari server.

## 10. Alur pengguna

**Layar dan indikator progres** (Template → Foto → Atur → Unduh)
1. **Beranda:** tombol Mulai.
   - Jika user agent menunjukkan browser dalam aplikasi (Instagram, Facebook, Line, dan sejenisnya), tampil banner "Buka di Chrome/Safari".
   - Banner bisa ditutup dan tidak memblokir pemakaian.
   - Banner berisi tombol salin link plus kolom teks berisi link yang bisa dipilih manual.
2. **Pilih template:** grid thumbnail dengan `loading="lazy"`. Jika daftar gagal dimuat, tampil tombol "Coba lagi".
3. **Booth:**
   - Area video mengikuti rasio slot yang sedang diisi, dengan `object-fit: cover`.
   - Hitung mundur sesuai `countdown_seconds`, lalu efek flash, lalu foto diambil.
   - Setelah jeda singkat, booth lanjut ke slot berikutnya sampai semua terisi.
   - Tombol **Batal** tersedia selama hitung mundur dan pengambilan berurutan.
   - Tombol lain: balik kamera, pilih kamera, layar penuh (hanya jika didukung), dan unggah dari galeri.
4. **Atur:**
   - Pilih slot dengan mengetuknya.
   - Geser foto dan zoom.
   - Ulang foto satu slot (kembali ke booth khusus untuk slot itu).
   - Pilih filter atau ganti template.
5. **Hasil:** pratinjau akhir dan tombol Unduh, Ulang sesi, dan Sesi baru.

**State (`state.js`):** `{ template, settings, photos[], transforms[], filter, facingRequested, logged }`
- Setiap foto adalah canvas berisi seluruh frame kamera, sisi terpanjang maksimal 1920 px, belum dipotong.
- `transforms[i] = { panX, panY, zoom }`. Pan disimpan sebagai pecahan ukuran slot; zoom 1–3. Nilai awalnya adalah posisi tengah dengan mode cover.

**Ganti template**
- Foto dipertahankan sesuai urutan, dan transform di-reset.
- Jika template baru punya slot lebih banyak, booth melanjutkan foto untuk slot yang belum terisi.
- Jika slotnya lebih sedikit, foto sisanya dibuang setelah pengguna mengonfirmasi.

**Ulang sesi dan sesi baru**
- **Ulang sesi:** template sama, semua foto diambil ulang.
- **Sesi baru:** kembali ke pilih template, semua state direset.
- Setiap reset melepas semua canvas (`width = height = 0`) dan object URL.

## 11. Kamera (`camera.js`)

**Fungsi**
- `start(video, pref)`:
  1. Cek dulu `isSecureContext` dan `navigator.mediaDevices?.getUserMedia`.
  2. Matikan semua track stream lama.
  3. Minta kamera dengan `width/height ideal 1920x1080` plus `deviceId` atau `facingMode`.
  4. Jika gagal karena `OverconstrainedError`, coba lagi dengan `{ video: true }`.
  - Elemen video memakai `playsinline` dan `muted`.
- `listCameras()`: dipanggil ulang setelah izin diberikan. Pilihan kamera disimpan di localStorage (dibungkus try/catch). `deviceId` yang sudah tidak ada dihapus setelah fallback.
- `flip()`: mengganti `facingMode` antara `user` dan `environment`. Tombolnya hanya muncul jika ada lebih dari satu kamera. Nilai yang diminta disimpan di `state.facingRequested`.
- `capture(video, maxSide, { mirror })`: mengembalikan canvas. Sisi terpanjang tidak dikecilkan di bawah resolusi asli kamera, dengan batas 1920.
- `stop()`.

**Cermin**
- Pratinjau dicerminkan lewat CSS hanya untuk kamera depan atau webcam.
- Foto yang diambil dicerminkan di `capture` hanya jika `mirror_output = 1` **dan** kamera adalah kamera depan atau webcam.
- Kamera depan ditentukan dari `facingRequested === 'user'`, dengan `getSettings().facingMode` sebagai konfirmasi. Kamera yang dipilih lewat `deviceId` di komputer dianggap webcam.
- Kamera belakang dan foto dari galeri tidak pernah dicerminkan.
- Render tidak tahu apa pun soal cermin.

**Pemulihan stream**
- Jika `track.onended` terpicu, atau tab kembali terlihat (`visibilitychange`) dan stream sudah mati, kamera dinyalakan ulang otomatis.
- Percobaan dibatasi 3 kali berturut-turut, lalu muncul pesan error.

**Pesan error** (semuanya menyertakan opsi unggah dari galeri):

| Kondisi | Pesan |
|---|---|
| Bukan HTTPS atau API tidak tersedia | Situs harus dibuka lewat HTTPS |
| `NotAllowedError` | Panduan mengaktifkan izin kamera per browser |
| `NotFoundError` | Kamera tidak ditemukan |
| `NotReadableError` | Tutup aplikasi lain yang memakai kamera |
| Lainnya | Pesan umum |

**Mode acara:**
- Wake Lock aktif selama di layar booth, dan diminta ulang saat `visibilitychange`.
- Tombol layar penuh hanya muncul jika didukung (tidak di iPhone).

**Unggah dari galeri**
- Memakai `input type=file accept=image/* multiple` untuk mengisi slot kosong secara berurutan.
- Gambar didekode dengan `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth/resizeHeight })` bila didukung, dengan cadangan `<img>`. Hasilnya diperkecil ke sisi maksimal 1920.
- Jika ada file yang gagal didekode (misalnya HEIC), tampil pesan per file.

**Catatan resolusi untuk README:**
- Webcam laptop selalu memberi frame lanskap. Untuk slot potret 1100x1700 dari frame 1920x1080, area yang terpakai sekitar **699x1080**, sehingga foto diperbesar sekitar 1,6 kali.
- Ponsel dalam posisi potret biasanya memberi frame potret, jadi masalah ini tidak terjadi di sana.
- Saran untuk admin: pakai slot lanskap jika booth memakai webcam laptop.

## 12. Render, filter, dan unduh

**`strip.js`: `render(canvas, { template, img, photos, transforms, filtered, scale })`**
1. Atur ukuran kanvas ke `canvas_w × scale` dan `canvas_h × scale`, lalu isi `bg_color`.
2. Untuk setiap slot: clip ke kotak slot, lalu gambar foto (sudah tersaring) dengan:
   - skala = `max(slot.w/foto.w, slot.h/foto.h) × zoom`
   - posisi = tengah slot + pan
   - `imageSmoothingQuality = 'high'`
3. Gambar PNG template paling akhir.

Pan selalu dibatasi lewat `geometry.js` agar foto tetap menutupi seluruh slot, termasuk setiap kali zoom berubah.

**Pratinjau dan hasil akhir**
- Pratinjau: `scale` dibuat agar kanvas pas di layar, dengan `devicePixelRatio` dibatasi 2. Render dijadwalkan lewat `requestAnimationFrame`.
- Hasil akhir: `scale = 1`.

**Gambar template** dimuat dengan `crossOrigin = 'anonymous'`. Jika penyimpanan nanti pindah ke domain lain, domain itu wajib mengirim header CORS (dicatat di README).

**Filter (`filters.js`)**
- Pilihan: Normal, Hitam putih, Sepia, Hangat, Dingin, Kontras.
- Setiap filter adalah matriks warna yang diterapkan ke `ImageData`. Pendekatan ini dipakai karena `ctx.filter` tidak didukung di Safari versi lama, sedangkan matriks warna memberi hasil yang sama di semua browser.
- **Cache dua tingkat:**
  - Di layar Atur, setiap foto punya salinan tersaring dengan sisi terpanjang 1024 px. Salinan ini dibuat ulang hanya saat filter diganti. Geser dan zoom cukup memanggil `drawImage` dari salinan.
  - Saat hasil akhir disiapkan, filter diterapkan sekali ke foto beresolusi penuh, lalu salinan sementaranya dilepas.
- Filter Normal tidak membuat salinan.

**Interaksi di layar Atur**
- Kanvas diberi `touch-action: none` dan input memakai Pointer Events dengan `setPointerCapture`.
- Satu pointer menggeser foto, dua pointer mencubit untuk zoom. Di desktop, roda mouse juga mengubah zoom.
- Ada juga slider dan tombol −/+ untuk zoom.
- Koordinat layar dikonversi ke koordinat template lewat `getBoundingClientRect` dan rasio ukuran CSS terhadap ukuran kanvas sebenarnya.

**Unduh**
- Hasil akhir disiapkan saat layar Hasil dibuka:
  - render `scale = 1`
  - `toBlob('image/jpeg', 0.92)`
  - `new File([blob], 'photobooth-YYYYMMDD-HHmmss.jpg')`
- Tombol Unduh nonaktif dengan tulisan "Menyiapkan..." sampai hasil siap.
- Kembali ke layar Atur dan mengubah sesuatu membuang hasil yang sudah disiapkan.
- Saat Unduh ditekan, urutan percobaannya:
  1. Perangkat sentuh yang mendukung `navigator.canShare({ files })`: panggil `navigator.share({ files })` langsung dari ketukan. Jika muncul `AbortError`, tidak ada tindakan dan tidak ada pesan.
  2. Selain itu: `<a download>` dengan object URL, lalu `revokeObjectURL` lewat `setTimeout` sekitar 1 detik.
  3. iOS lama: tampilan gambar layar penuh dengan petunjuk "Tekan lama gambar lalu pilih Simpan". URL baru dilepas saat tampilan ditutup.
- Pada Unduh pertama, `POST /api/sessions` dikirim tanpa ditunggu dan kegagalannya diabaikan. `logged` hanya menjadi true jika berhasil, sehingga dicoba lagi pada Unduh berikutnya.

**Alasan JPEG:** hasil akhir tidak punya bagian transparan karena latarnya terisi, dan JPEG jauh lebih kecil sehingga lebih cepat dibagikan di jaringan acara.

## 13. Halaman admin

**`login.html`**
- Form username dan password.
- Pesan gagal selalu umum. Jika terkena rate limit: "Coba lagi dalam X menit", dengan X dari header `Retry-After`.

**`dashboard.html`**
- Kartu statistik.
- Tabel template: thumbnail (lazy), nama, ukuran, jumlah slot, status, dan jumlah pemakaian.
- Aksi: Edit, Aktifkan/Nonaktifkan, Arsipkan, dan Hapus. Tombol Hapus hanya muncul jika pemakaian = 0 dan selalu meminta konfirmasi.
- Form pengaturan: hitung mundur dan sakelar cermin.

**`template-edit.html`** (untuk tambah dan edit)
1. **Pilih PNG.** Browser membaca ukuran asli gambar dan mengisi `canvas_w` dan `canvas_h`; kolom ini hanya bisa dibaca.
2. **Nama dan warna latar.**
3. **Daftar slot:** setiap baris berisi x, y, w, h, dengan tombol tambah, hapus, dan ↑/↓ untuk urutan. Maksimal 8 slot.
4. **Deteksi slot otomatis** (prioritas "kalau sempat"):
   - Flood fill iteratif dengan penanda `Uint8Array` pada piksel yang alpha-nya di bawah ambang.
   - Kotak pembatas setiap komponen dijadikan slot.
   - Komponen yang lebih kecil dari 0,5% luas kanvas diabaikan.
   - Hasil diurutkan atas→bawah lalu kiri→kanan.
   - Peringatan muncul jika hasilnya 0 slot atau lebih dari 8.
   - Indikator "sedang memproses" ditampilkan selama deteksi.
5. **Pratinjau langsung** lewat `strip.js` dengan foto contoh berupa kotak berwarna bernomor:
   - garis tepi setiap slot ditampilkan
   - slot error ditandai merah, slot yang tumpang tindih ditandai kuning
6. **Simpan:**
   - Browser membuat thumbnail JPEG dengan sisi sekitar 400 px: PNG template di atas warna latar, dengan slot diisi abu-abu netral.
   - Thumbnail dikirim setiap kali PNG, slot, atau warna latar berubah.
   - Hasil simpan berstatus `inactive` (atau kembali `inactive` sesuai aturan PUT), dan UI memberi tahu admin.
   - Tombol Aktifkan baru menyala setelah tersimpan dan validasi lolos.

**`admin.js`**
- Setiap halaman memanggil `GET /api/auth/me` saat dibuka.
- Respons 401 di **setiap** panggilan API mengarahkan admin ke halaman login.

## 14. Pengujian

**Otomatis** (`node:test` + `supertest`, SQLite di memori, folder upload sementara, fixture dari `db/seed-sample.js`)
- Auth: login berhasil dan gagal, rate limit beserta `Retry-After`, 401, `checkOrigin` (403).
- Template:
  - validasi PNG dan JPEG (tanda tangan, dimensi, ukuran)
  - batas kanvas dan slot
  - thumbnail wajib (422)
  - urutan dan rollback PUT
  - transisi status, aktivasi 422, hapus 409
  - respons publik tanpa path
- **Rollback storage:** simulasi kegagalan saat menyimpan salah satu file harus membuktikan tidak ada file yang tertinggal.
- `POST /api/sessions`: validasi, hanya template active, `photo_count` dari server.
- Pengaturan: whitelist dan rentang nilai.
- `lib/time.js`: batas hari menurut TZ.
- `config.js`: gagal cepat di produksi.
- Modul murni: `geometry.js`, `filters.js`, `slots.js`, `detect-slots.js`.

**Manual** (`docs/manual-test.md`)
- Perangkat: Chrome laptop + webcam bawaan, webcam USB, Chrome Android, Safari iPhone/iPad.
- Kasus:
  - izin ditolak
  - balik kamera, webcam dicabut
  - rotasi layar, tab ke latar belakang
  - Batal di tengah hitung mundur
  - ganti template dengan jumlah slot berbeda
  - unduh dan berbagi (termasuk membatalkan lembar berbagi)
  - galeri dan HEIC
  - browser dalam aplikasi
  - login dan cek Origin lewat tunnel

## 15. Deploy

**Target:** hosting dengan disk persisten (Railway, Fly.io, Render dengan disk, atau VPS). Platform dipilih setelah membandingkan harga terbaru. Vercel, Netlify, dan sejenisnya tidak bisa dipakai karena disk mereka tidak permanen.

**Pengembangan:** uji dari ponsel lewat `cloudflared tunnel --url http://localhost:3000` (atau ngrok).

**README memuat:**
- Env, dan cara menjalankan seed admin, seed contoh, dan backup.
- **Backup:** database **dan** folder uploads selalu dicadangkan bersama (`scripts/backup.js`).
- **Satu instance saja.** Pastikan platform tidak menjalankan dua instance bersamaan pada volume yang sama saat deploy bergulir.
- Nginx: `client_max_body_size 6m`.
- Catatan resolusi webcam (699x1080) dan syarat CORS untuk penyimpanan di domain lain.
- HTTPS wajib, karena kamera tidak berfungsi tanpanya.

## 16. Prioritas dan urutan pengerjaan

**Wajib**, dikerjakan berurutan:
1. Fondasi server dan keamanan: config, database, session, auth, middleware, storage, seed.
2. Admin CRUD template dengan form slot, pratinjau, pengaturan, dan **thumbnail** (agar ada template sungguhan). Thumbnail masuk tahap ini karena `POST /api/admin/templates` mewajibkan `thumb`.
3. Alur pengguna: kamera, booth, Atur, render, dan unduh. `seed-sample.js` mempercepat langkah ini.
4. Butir "kalau sempat" di bawah.

**Kalau sempat:**
- deteksi slot otomatis
- filter selain Normal, Hitam putih, dan Sepia
- zoom dengan roda mouse

**Ditunda:** semua yang ada di bagian 1, "Di luar cakupan".

## 17. Risiko

| Risiko | Penanganan |
|---|---|
| Izin kamera ditolak | Panduan per browser + unggah dari galeri |
| Koordinat slot salah | Pratinjau, validasi bersama (`slots.js`), aktivasi 422, deteksi otomatis |
| Memori ponsel lama | Batas kanvas 12 juta piksel, maksimal 8 slot, foto maksimal 1920 px, cache filter dua tingkat |
| Perilaku iOS | `playsinline`/`muted`, `share` dari ketukan, cadangan tekan lama, filter matriks |
| Deploy tanpa HTTPS | Pesan error jelas + catatan di README |
| Jaringan acara buruk | Thumbnail, cache immutable, log sesi tanpa ditunggu; cache offline ditunda |
| Kehilangan data | Backup database dan uploads bersama; satu instance |
