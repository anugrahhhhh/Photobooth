# Sub-proyek C: Kirim Hasil (QR, Email, WhatsApp), GIF/Video, dan Cermin — Desain

Tanggal: 2026-10-23
Status: disetujui per bagian dalam sesi brainstorming, menunggu tinjauan spec
Dasar: [2026-10-12-photobooth-design.md](2026-10-12-photobooth-design.md) (v1) dan [2026-10-12-redesign-kiosk-design.md](2026-10-12-redesign-kiosk-design.md) (sub-proyek A). Semua aturan keduanya tetap berlaku kecuali diubah di sini.

## 1. Konteks dan tujuan

Sub-proyek ini menggabungkan sub-proyek C (QR dan hasil tersimpan di server) dengan bagian GIF/video dari sub-proyek D, ditambah tombol cermin. Booth dipakai dengan dua cara: tablet/laptop kiosk di acara, dan HP tamu sendiri.

**Tujuan:**
- Tamu bisa mendapatkan hasilnya lewat **QR**, **email**, dan **WhatsApp**, baik dengan mengisi kontak sebelum sesi maupun memilih kirim setelah sesi.
- Setiap sesi menghasilkan **GIF stop-motion**, dan bila diaktifkan admin, **video sesi**.
- Tamu bisa memilih **cermin** atau tidak, dan hasilnya selalu sama dengan yang terlihat di layar.

**Kriteria sukses:**
- Di Chrome headless dengan kamera palsu: sesi penuh → QR → halaman hasil menampilkan foto, GIF, dan video; email terkirim ke server SMTP tiruan; WhatsApp terkirim ke API tiruan.
- Kiosk yang reset karena menganggur saat layar QR terbuka tidak memperlihatkan foto atau kontak tamu sebelumnya, dan kiriman yang sudah diantrekan tetap terkirim.
- Hasil yang berumur lebih dari 7 hari hilang dari disk dan database.
- Seluruh tes yang ada tetap lulus. Asersi yang berubah karena spec ini (objek pengaturan default dan `mirror_output`) disesuaikan.

**Keputusan dasar:**
- **Aturan baru tentang foto tamu:** foto hanya dikirim ke server bila tamu memilih QR, email, atau WhatsApp (atau mengisi kontak di awal) **dan** mencentang persetujuan. Tombol Unduh tidak mengunggah apa pun.
- Browser tetap menyusun photostrip, GIF, dan video. Server hanya menyimpan, menyajikan, dan mengirim.
- Teknologi tetap: Express, SQLite, JavaScript vanilla tanpa build tool. Dependensi baru: `nodemailer` dan `qrcode` (server), serta encoder GIF `gifenc` (MIT) yang disalin ke `public/vendor/` beserta lisensinya.
- Masa simpan hasil tetap **7 hari** (`RESULT_TTL_DAYS = 7`).
- WhatsApp memakai **WhatsApp Cloud API resmi (Meta)** dan bersifat opsional. Email memakai **SMTP** (awalnya Gmail dengan App Password), dan bisa diganti layanan lain lewat pengaturan.

## 2. Alur tamu

### 2.1 Sebelum sesi (opsional)

Bila pengaturan `contact_before = 1`, layar baru **`contact`** muncul setelah tamu menekan Mulai, sebelum Pilih template:
- Isian **Nomor WhatsApp** (hanya bila WhatsApp aktif) dan **Email** (hanya bila email aktif). Keduanya opsional.
- Kotak centang persetujuan: "Foto disimpan di server selama 7 hari agar bisa dikirim ke kamu."
- Tombol **Lanjut** (aktif bila minimal satu kontak valid dan persetujuan dicentang) dan **Lewati**.
- Bila tidak ada layanan yang aktif, layar ini dilewati.
- Kontak disimpan di state sesi. Begitu foto terunggah di layar Hasil, kiriman ke kontak itu langsung diantrekan.

### 2.2 Selama sesi

- Layar Berpose punya tombol **Cermin** (`aria-pressed`). Aturannya di §5.
- Bila `video_enabled = 1` dan perangkat mendukung, perekaman berjalan dengan indikator "● REC". Detailnya di §6.2.

### 2.3 Setelah sesi (layar Hasil)

- Tab **Foto | GIF | Video**. Tab Video hanya muncul bila ada rekaman. GIF dan video disiapkan di latar belakang dengan indikator "Menyiapkan GIF…".
- Tombol **Unduh** untuk tab yang aktif. Urutan percobaan unduh sama seperti sekarang.
- Panel **Kirim / Bagikan**:
  - **QR:** mengunggah hasil (setelah persetujuan), lalu menampilkan kode QR besar dan alamat pendek halaman hasil.
  - **Email:** isian alamat, tombol Kirim, dan status kiriman.
  - **WhatsApp:** isian nomor, tombol Kirim, dan status. Hanya muncul bila WhatsApp aktif.
  - **Bagikan** (Web Share): hanya di HP tamu sendiri, yaitu bila kiosk mati dan `(pointer: coarse)` cocok. Membagikan file foto, atau GIF bila tab GIF aktif.
- Persetujuan diminta sekali per sesi, saat pertama kali tamu memilih QR, Email, atau WhatsApp. Bila kontak sudah diisi di awal, persetujuan tidak ditanyakan lagi.
- Kembali ke Atur lalu mengubah foto membuat hasil baru di server pada kiriman berikutnya. Hasil lama tidak diubah dan kedaluwarsa sendiri.

### 2.4 Kiosk

- `expireSession` dan "Sesi baru" menutup panel QR, mengosongkan isian kontak, menghentikan polling status, dan melepas blob GIF/video.
- Kiriman yang sudah diantrekan tetap dikerjakan server.

## 3. Server: penyimpanan dan halaman hasil

### 3.1 Tabel baru

```sql
CREATE TABLE IF NOT EXISTS results (
  id          INTEGER PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,      -- 22 karakter base64url (128 bit)
  key_hash    TEXT NOT NULL,             -- sha256 dari kunci unggah (32 byte acak)
  template_id INTEGER,                   -- informatif, tanpa FK
  lang        TEXT NOT NULL CHECK (lang IN ('id','en')),
  base_url    TEXT NOT NULL,             -- asal publik saat dibuat, misal https://photobooth-anugrah.fly.dev
  has_gif     INTEGER NOT NULL DEFAULT 0,
  video_type  TEXT,                      -- 'mp4' | 'webm' | NULL
  bytes       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_expires_at ON results(expires_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id               INTEGER PRIMARY KEY,
  result_id        INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient        TEXT,                -- utuh sampai terkirim/gagal final, lalu NULL
  recipient_masked TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('queued','sending','sent','failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT NOT NULL,
  last_error       TEXT,
  created_at       TEXT NOT NULL,
  sent_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_queue ON deliveries(status, next_attempt_at);
```

File disimpan di `<UPLOAD_DIR>/results/<token>/`: `photo.jpg`, `anim.gif`, dan `video.mp4` atau `video.webm`.

### 3.2 API publik

Semua request yang mengubah data melewati `checkOrigin` dan `noStore`. Kunci unggah dikirim lewat header `X-Result-Key` dan dibandingkan dengan `crypto.timingSafeEqual` terhadap hash yang tersimpan. Kunci salah atau tidak ada → 403.

| Endpoint | Isi | Respons |
|---|---|---|
| `POST /api/results` | multipart: `photo` (JPEG ≤ 8 MB, dicek magic byte), `template_id`, `lang`, `consent=1` | 201 `{ token, key, url, expires_at }`. Tanpa `consent=1` → 422. Penjaga disk menolak → 507 |
| `PUT /api/results/:token/gif` | body mentah `image/gif` ≤ 10 MB (magic `GIF8`) | 204. Mengganti GIF yang sudah ada |
| `PUT /api/results/:token/video` | body mentah `video/mp4` atau `video/webm` ≤ 30 MB (dicek magic byte) | 204 |
| `GET /api/results/:token` | — | 200 `{ expires_at, photo_url, gif_url, video_url, video_type }` (yang belum ada bernilai `null`). Token tidak dikenal → 404. Sudah lewat `expires_at` tetapi belum dibersihkan → 410 |
| `GET /api/results/:token/qr.svg` | — | SVG QR berisi `base_url + /p/:token` |
| `POST /api/results/:token/send` | `{ channel, to }` + kunci | 202 `{ id }`. Format tidak valid → 422. Layanan tidak aktif → 409. Lebih dari 3 kiriman per hasil → 429 |
| `GET /api/results/:token/deliveries` | kunci | 200 `[{ id, channel, to: recipient_masked, status }]` |

Batas laju per IP: pembuatan hasil `RESULT_CREATE_LIMIT = 60` per 10 menit, dan kiriman `DELIVERY_LIMIT = 30` per 10 menit. Satu booth berbagi IP, jadi batasnya longgar. Setiap file yang ditolak atau gagal ditulis tidak meninggalkan sisa di disk.

File disajikan di `GET /r/:token/photo.jpg`, `/r/:token/anim.gif`, dan `/r/:token/video.(mp4|webm)` dengan `Cache-Control: private, max-age=3600`, `X-Robots-Tag: noindex`, dan dukungan `Range` untuk video. Parameter `?download=1` menambahkan `Content-Disposition: attachment; filename="photobooth-<tanggal>.<ext>"`. Hasil kedaluwarsa → 410.

### 3.3 Halaman hasil

- `GET /p/:token` (token cocok `/^[A-Za-z0-9_-]{22}$/`) mengirim `public/result.html`, dengan meta `robots: noindex`. Token yang tidak cocok → 404.
- `public/js/result-page.js` mengambil `GET /api/results/:token`, lalu menampilkan foto, GIF, dan video dengan tombol Unduh masing-masing, tombol **Kirim ke WhatsApp** (`https://wa.me/?text=<teks + url halaman>`), dan **Bagikan** bila Web Share tersedia.
- Selama `gif_url`/`video_url` masih `null` dan hasil berumur kurang dari 10 menit, halaman memeriksa ulang setiap 5 detik sambil menampilkan "Sedang disiapkan…".
- Halaman menampilkan "Tersedia sampai <tanggal>". Respons 410 menampilkan "Foto ini sudah dihapus otomatis setelah 7 hari", dan 404 menampilkan "Link tidak ditemukan".
- Gaya `fun`, dua bahasa (default dari `lang` hasil, bisa diganti), dan tema terang/gelap.

### 3.4 Pembersihan dan penjaga disk

- `cleanupResults(db, now)` menghapus folder dan baris hasil yang `expires_at <= now` (kiriman ikut terhapus lewat cascade). Dijalankan saat server menyala lalu setiap jam (interval `unref`, mati saat tes).
- **Penjaga disk:** sebelum menerima file, server memeriksa `fs.statfs` pada `UPLOAD_DIR`. Bila ruang kosong kurang dari `max(100 MB, 15% total)`, unggahan ditolak 507 dengan pesan "Penyimpanan penuh. Hubungi petugas."

## 4. Server: pengiriman

### 4.1 Antrean

- `POST /send` menyisipkan baris `deliveries` berstatus `queued`, dengan `next_attempt_at = now` dan `recipient_masked` langsung diisi.
- Worker di dalam proses berjalan setiap 3 detik (interval `unref`, mati saat tes, bisa dipicu manual di tes). Ia mengambil maksimal 2 baris `queued` yang sudah jatuh tempo, menandainya `sending`, lalu mengirim.
- Berhasil → `sent`, `sent_at` diisi, `recipient = NULL`. Gagal → `attempts + 1`. Bila percobaan masih kurang dari 3, kembali `queued` dengan jeda 30 detik setelah kegagalan pertama dan 2 menit setelah kegagalan kedua. Percobaan ketiga yang gagal → `failed` dan `recipient = NULL`. `last_error` menyimpan pesan singkat tanpa kredensial.
- Saat server menyala, baris yang tertinggal di status `sending` dikembalikan ke `queued`.

### 4.2 Kontak

Modul murni bersama `public/js/contact.js` dipakai oleh server dan browser:
- `normalizePhone(input) -> string | null`: buang semua selain angka; awalan `0` diganti `62`; hasil harus cocok `/^[1-9]\d{9,14}$/`.
- `isValidEmail(input) -> boolean`: panjang maksimal 254, pola `lokal@domain.tld` sederhana tanpa spasi.
- `maskEmail('rina.putri@gmail.com') -> 'ri***@gmail.com'` dan `maskPhone('6281234567890') -> '6281****7890'`.

### 4.3 Email

- Aktif bila `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, dan `SMTP_PASS` terisi. `SMTP_FROM` default ke `SMTP_USER`. Port 465 memakai `secure: true`.
- Subjek dan isi mengikuti `lang` hasil. Subjek id: "Foto photobooth kamu 📸", en: "Your photobooth photos 📸".
- Isi HTML sederhana berupa salam singkat, foto strip sebagai lampiran inline, tombol **"Lihat GIF & video"** ke halaman hasil, dan keterangan masa simpan. Disertai versi teks biasa.
- GIF dan video tidak dilampirkan.

### 4.4 WhatsApp

- Aktif bila `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_TEMPLATE_NAME`, dan `WA_TEMPLATE_LANG` terisi. `WA_API_BASE` (default `https://graph.facebook.com/v21.0`) bisa diganti untuk tes.
- `POST {WA_API_BASE}/{WA_PHONE_NUMBER_ID}/messages` dengan pesan `template`: komponen `header` berupa gambar dengan `link` ke foto, dan komponen `body` dengan satu parameter teks berisi URL halaman hasil.
- Respons non-2xx dianggap gagal dan dicoba lagi sesuai §4.1.

### 4.5 Pengaturan publik

`GET /api/settings` ditambah `share_email: boolean` dan `share_whatsapp: boolean` sesuai §4.3 dan §4.4. Nilai env tidak pernah dikirim ke browser.

## 5. Cermin

- Pengaturan `mirror_default` (0–1, default 1) **menggantikan** `mirror_output`, yang dihapus dari `SETTINGS_SCHEMA`.
- State cermin per kamera:
  - Kamera depan/webcam mulai dari `pb.mirror` per perangkat bila ada, kalau tidak dari `mirror_default`.
  - Kamera belakang selalu mulai tidak dicermin.
- Tombol **Cermin** mengubah state kamera yang sedang aktif. Untuk kamera depan, nilainya disimpan ke `pb.mirror`.
- Bila cermin aktif, pratinjau, foto (`camera.capture(..., { mirror: true })`), dan video ikut dicermin. GIF mengikuti foto. Bila mati, tidak ada yang dicermin.
- Foto dari galeri tidak pernah dicermin.

## 6. GIF dan video

### 6.1 GIF stop-motion

- `planGifFrames(template, photos, transforms, filter, maxSide = 640) -> [{ sx, sy, sw, sh, w, h }]` (murni) menghitung potongan tiap foto yang identik dengan potongan di photostrip (memakai `geometry.photoRect` dan `clampTransform`).
- Penggambar membuat satu canvas per bingkai dengan filter aktif.
- `public/js/media/gif-worker.js` (Web Worker, memakai `public/vendor/gifenc.js`) mengkuantisasi 256 warna per bingkai, dengan jeda 600 ms dan berulang tanpa henti.
- Dibuat saat masuk layar Hasil, dan diulang bila foto, transform, atau filter berubah (memakai token versi seperti result store). Blob lama dilepas.
- Bila worker gagal, tab GIF menampilkan "GIF tidak bisa dibuat" dan bagian lain tetap jalan.

### 6.2 Video sesi

- `pickVideoMime(isTypeSupported) -> { mime, ext } | null` (murni) memilih urutan `video/mp4;codecs=avc1`, `video/mp4`, `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, lalu `video/webm`.
- `createSessionRecorder({ video, mirror, maxMs = 90000 })`:
  - Menggambar video ke canvas (sisi panjang 1280, 24 fps), dicermin sesuai state, ditambah overlay angka hitung mundur dan kilatan.
  - Merekam `canvas.captureStream(24)` dengan `MediaRecorder` (bitrate 2,5 Mbps, tanpa audio).
  - Metode: `start()`, `pause()`, `resume()`, `setOverlay({ count, flash })`, `stop() -> Promise<Blob|null>`, `discard()`.
- Mulai pada hitung mundur pertama sesi, `pause()` saat layar Tinjau, `resume()` saat kembali memotret, dan `stop()` setelah foto terakhir. Berhenti otomatis pada 90 detik.
- Batal di tengah urutan, Ulang sesi, Sesi baru, dan reset kiosk memanggil `discard()`.
- Bila `MediaRecorder` atau `captureStream` tidak tersedia, atau `pickVideoMime` mengembalikan `null`, video dilewati diam-diam.

## 7. Admin

Halaman Pengaturan mendapat grup **Hasil & Kirim**:
- Saklar **Cermin default** (`mirror_default`), **Minta kontak di awal sesi** (`contact_before`, default 0), dan **Rekam video sesi** (`video_enabled`, default 0).
- Status layanan: Email dan WhatsApp masing-masing "Aktif ✓" atau "Belum diatur".
- **Kirim email uji:** `POST /api/admin/test-email { to }` mengirim langsung (tanpa antrean) dan mengembalikan pesan error SMTP yang sudah dibersihkan bila gagal.
- Penyimpanan: `GET /api/admin/results/summary` → `{ count, bytes, disk_total, disk_free, deliveries_7d: { sent, failed } }`. Tombol **Hapus semua hasil sekarang** (`DELETE /api/admin/results`, dengan konfirmasi) → 204.

Dashboard menampilkan kiriman berhasil dan gagal dalam 7 hari terakhir dari ringkasan yang sama.

## 8. Struktur kode

| File | Isi |
|---|---|
| `db/index.js` | tabel §3.1, `SETTINGS_SCHEMA` (+`mirror_default`, `contact_before`, `video_enabled`, −`mirror_output`) |
| `lib/results-store.js` | buat/ambil/tambah file/hapus hasil, `cleanupResults`, penjaga disk |
| `lib/delivery-queue.js` | antrean, worker, backoff |
| `lib/mailer.js`, `lib/whatsapp.js` | pengirim email dan WhatsApp, masing-masing dengan `isConfigured(env)` |
| `routes/results.js` | API §3.2, `/r/*`, `/p/:token` |
| `routes/admin-results.js` | API admin §7 |
| `public/js/contact.js` | modul murni §4.2 |
| `public/js/booth/screens/contact.js` | layar §2.1 |
| `public/js/booth/share.js` | unggah hasil, QR, kirim, polling status |
| `public/js/media/gif.js`, `public/js/media/gif-worker.js`, `public/vendor/gifenc.js` | §6.1 |
| `public/js/media/recorder.js` | §6.2 |
| `public/result.html`, `public/js/result-page.js`, `public/css/result.css` | §3.3 |

## 9. Pengujian

**Otomatis (`node:test`):**
- `contact.js`: normalisasi nomor (`0812…`, `+62 812-…`, `62…`, terlalu pendek, huruf), validasi email, penyamaran.
- `results`:
  - Unggah valid; tanpa persetujuan; bukan JPEG; terlalu besar.
  - PUT GIF/video dengan kunci benar, salah, atau tidak ada.
  - Respons 404/410.
  - `cleanupResults` dengan jam palsu menghapus folder dan baris.
  - Penjaga disk dengan `statfs` palsu menghasilkan 507.
  - Tidak ada file sisa setelah penolakan.
  - Token 22 karakter, dan kunci tidak pernah muncul di `GET`.
- `delivery-queue` dengan pengirim palsu:
  - Sukses menghasilkan `sent` dan `recipient` NULL.
  - Gagal dua kali lalu sukses.
  - Gagal tiga kali menghasilkan `failed`.
  - Kiriman ke-4 menghasilkan 429.
  - Layanan tidak aktif menghasilkan 409.
  - `sending` yang tertinggal dikembalikan ke `queued` saat start.
- `mailer`: memakai transport `jsonTransport` milik nodemailer untuk memeriksa subjek, lampiran, dan link sesuai bahasa.
- `whatsapp`: server HTTP tiruan lokal (`WA_API_BASE`) untuk memeriksa bentuk JSON template dan header Authorization.
- `settings`: kunci baru, `mirror_output` ditolak 400, dan `share_email`/`share_whatsapp` di `GET`.
- `pickVideoMime` dan `planGifFrames` (potongan sama dengan `photoRect`).
- Kunci i18n baru ada di kedua kamus (tes yang sudah ada).

**Browser (Chrome headless + kamera palsu, server terisolasi, SMTP dan WhatsApp tiruan):**
- Sesi penuh → QR → buka `/p/:token` di tab lain: foto, lalu GIF dan video muncul.
- Kontak di awal → sesi → email dan WhatsApp masuk ke tiruan, booth menampilkan "Terkirim ✓".
- Cermin aktif dan mati: hasil foto dicermin atau tidak, sesuai pratinjau.
- Kiosk: reset menganggur saat panel QR terbuka → sambutan, tanpa QR atau kontak lama.
- 390, 820, dan 1440 px; terang/gelap; id/en; tanpa error konsol atau CSP.

**Manual (`docs/manual-test.md`):** kirim ke Gmail sungguhan, WhatsApp sungguhan setelah template Meta disetujui, video di iPhone dan Android, dan scan QR dengan HP.

## 10. Urutan pengerjaan

1. Tombol Cermin dan `mirror_default`.
2. Penyimpanan hasil, QR, dan halaman hasil (§3).
3. Antrean dan pengiriman email, lalu WhatsApp (§4).
4. GIF stop-motion (§6.1).
5. Video sesi (§6.2).
6. Admin lengkap (§7), README (App Password Gmail, WhatsApp Cloud API, secret Fly), uji akhir, dan deploy.

## 11. Di luar cakupan

- Boomerang per jepretan.
- Galeri penyelenggara yang menampilkan semua hasil acara.
- Gateway WhatsApp tidak resmi, SMS, dan cetak langsung.
- Branding atau acara per klien (sub-proyek B).

## 12. Risiko

| Risiko | Penanganan |
|---|---|
| Foto tamu kini tersimpan di server | Hanya dengan persetujuan, token acak 128 bit, noindex, dihapus otomatis 7 hari, kontak disamarkan setelah terkirim |
| Booth dipakai untuk spam email/WA | Kunci unggah wajib, maksimal 3 kiriman per hasil, batas laju per IP |
| Gmail menolak atau membatasi (≈500/hari) | Antrean dengan percobaan ulang, status gagal yang jelas, SMTP bisa diganti layanan lain |
| Template WhatsApp belum disetujui Meta | Fitur WhatsApp tersembunyi sampai env lengkap, QR tetap tersedia |
| Perangkat lambat saat membuat GIF/video | GIF di Web Worker, video opsional dan default mati, kegagalan tidak menghentikan booth |
| Volume 1 GB penuh | Penjaga disk 507, ringkasan dan hapus semua di admin, masa simpan 7 hari |
| Mesin Fly berhenti otomatis saat worker antre | Worker melanjutkan antrean saat mesin menyala lagi (status `sending` dipulihkan). README menyarankan `min_machines_running = 1` saat acara |
