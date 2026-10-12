# Sub-proyek A: Redesain UI dan Mode Kiosk — Desain

Tanggal: 2026-10-12
Status: disetujui dalam sesi brainstorming, menunggu tinjauan spec
Dasar: [2026-10-12-photobooth-design.md](2026-10-12-photobooth-design.md) (v1). Semua aturan v1 tetap berlaku kecuali diubah di sini.

## 1. Konteks dan tujuan

Photobooth akan menjadi **produk publik**. Model pemakaiannya bertahap: mula-mula vendor (satu tim admin menyiapkan booth untuk klien), lalu nanti dibuka untuk pendaftaran mandiri penyelenggara. Pengembangannya dibagi menjadi sub-proyek:

| # | Sub-proyek | Status |
|---|---|---|
| **A** | Redesain UI + mode kiosk | **dokumen ini** |
| B | Acara & branding (link per acara, branding klien, statistik per acara) | berikutnya |
| C | QR & galeri (hasil disimpan di server dengan persetujuan tamu) | setelah B |
| D | Stiker, teks, GIF/boomerang | setelah A |
| E | Pendaftaran mandiri, multi-tenant, pembayaran | nanti |

**Tujuan A:**
- Tampilan profesional dan konsisten. Booth dan landing bergaya ceria; admin bergaya bersih.
- Booth nyaman di **perangkat campuran**: tablet di stand, laptop/TV, dan ponsel tamu.
- Booth bisa ditinggal di acara tanpa petugas berjaga: layar sambutan, reset otomatis, terkunci PIN.
- Pengalaman berfoto yang lebih baik: bingkai terlihat saat berpose, tinjau tiap foto, dua bahasa, tema gelap.

**Kriteria sukses:**
- Sesi penuh di landing → booth → unduh berjalan di keempat perangkat uji v1, di tema terang dan gelap, dalam bahasa Indonesia dan English.
- Booth dalam mode kiosk kembali sendiri ke layar sambutan setelah menganggur, dan hanya bisa keluar dari kiosk dengan PIN.
- Seluruh 189 tes v1 tetap lulus.

**Keputusan dasar:**
- Teknologi tetap sama dengan v1: Express, SQLite, JavaScript vanilla dengan ES modules, **tanpa build tool**.
- Foto tamu tetap tidak pernah dikirim ke server (berubah baru di sub-proyek C).
- Nama produk tetap "Photobooth" dan disimpan di satu konstanta.
- Gaya terinspirasi neo-brutalism yang ceria, tetapi dengan identitas sendiri: tidak memakai nama, logo, ilustrasi, teks, atau palet ungu–kuning milik produk lain.

## 2. Sistem visual

### 2.1 Token

Semua nilai ada di `public/css/tokens.css` sebagai CSS variables. Ada dua gaya (`data-skin="fun"` untuk landing dan booth, `data-skin="clean"` untuk admin) dan dua mode (terang dan gelap).

**Gaya ceria (fun), terang:**

| Token | Nilai | Pemakaian |
|---|---|---|
| `--bg` | `#FFF6EC` | latar krem |
| `--grid` | `#F3E6D6` | garis pola grid latar (22 px) |
| `--surface` | `#FFFFFF` | kartu, panel |
| `--ink` | `#16161A` | teks utama, outline, bayangan kotak |
| `--muted` | `#5B5B66` | teks sekunder |
| `--primary` | `#FF5A4E` | koral: tombol utama, aksen |
| `--on-primary` | `#16161A` | teks di atas koral (kontras ±6,4:1) |
| `--accent` | `#14B8A6` | toska: pilihan aktif, pita "Cara Kerjanya" |
| `--sun` | `#FFC94D` | kuning lembut: nomor langkah, ajakan penutup |
| `--outline` | `2.5px solid var(--ink)` | |
| `--shadow` | `3px 3px 0 var(--ink)` (kartu besar `5px 5px 0`) | |
| `--radius` | 12 px (tombol: pil penuh, kartu besar 18–22 px) | |

**Gaya ceria, gelap:** `--bg #17161C`, `--grid #24222B`, `--surface #22212A`, `--ink #F4F4F5` untuk teks, outline dan bayangan `#000000`, `--muted #A1A1AA`, `--primary #FF6B60`, `--accent #2DD4BF`, `--sun #F5C451`. Teks di atas koral tetap `#16161A`.

**Gaya bersih (clean, admin), terang:** `--bg #FAFAF9`, `--surface #FFFFFF`, `--border #E7E5E4`, `--text #27272A`, `--muted #71717A`, `--primary #D93A2F` (teks putih, kontras ±4,6:1), `--primary-soft #FFF1EF`, `--accent #0F8F82`, radius 12 px, tanpa outline tebal maupun bayangan kotak; bayangan halus `0 1px 2px rgb(0 0 0 / 6%)`.

**Gaya bersih, gelap:** `--bg #141317`, `--surface #1D1C21`, `--border #2E2D33`, `--text #EDEDEF`, `--muted #A1A1AA`, `--primary #FF6B60` (teks `#16161A`), `--primary-soft #3A1F1D`, `--accent #2DD4BF`.

Semua pasangan teks/latar memenuhi kontras WCAG AA (4,5:1 untuk teks biasa).

### 2.2 Huruf

- **Judul:** Bricolage Grotesque 800. Judul besar di gaya ceria memakai warna isi putih (atau `--accent` untuk kata kedua), outline `--ink` 2–3 px (`-webkit-text-stroke` dengan `paint-order: stroke fill`), dan bayangan teks kotak.
- **Teks:** Plus Jakarta Sans 400/600/700.
- Keduanya berlisensi OFL, disimpan sebagai `.woff2` (subset Latin) di `public/fonts/` dengan `font-display: swap`. Tidak ada Google Fonts, sehingga CSP tetap `self` dan halaman tetap tampil di Wi-Fi acara yang buruk.

### 2.3 Komponen bersama (`public/css/components.css`)

Tombol (utama, sekunder, bahaya, ikon; ukuran normal 44 px dan besar 56 px), kartu, chip/filter, input, slider, saklar, dialog modal, toast, batang progres, dan indikator langkah. Setiap komponen punya varian `fun` dan `clean` lewat token, bukan class terpisah. Semua elemen interaktif minimal 44×44 px, punya tanda fokus yang jelas (`:focus-visible`), dan menghormati `prefers-reduced-motion`.

### 2.4 Tema

`public/js/theme.js` menyimpan pilihan `system` | `light` | `dark` di `localStorage` (`pb.theme`, dibungkus try/catch) dan memasang `data-theme` di `<html>`. `system` mengikuti `prefers-color-scheme`. Tombol tema ada di navigasi landing, di menu booth, dan di sidebar admin.

## 3. Halaman dan alamat

| Alamat | File | Gaya |
|---|---|---|
| `/` | `public/index.html` (landing) | fun |
| `/booth` | `public/booth.html` | fun |
| `/admin/login.html` | | clean |
| `/admin/dashboard.html` | | clean |
| `/admin/templates.html` (baru, tabel template pindah dari dashboard) | | clean |
| `/admin/template-edit.html` | | clean |
| `/admin/settings.html` (baru, form pengaturan pindah dari dashboard) | | clean |

`/booth` dilayani lewat route Express yang mengirim `booth.html`. Booth v1 yang dulu ada di `/` pindah ke `/booth`.

### 3.1 Landing page

1. **Navigasi** berbentuk kartu ber-outline: logo dan nama produk, tautan "Cara kerja" dan "Template" (gulir ke bagian), pilihan bahasa, tombol tema, dan tombol utama "Mulai Foto" ke `/booth`.
2. **Hero:** judul "Abadikan / Momen Seru!", satu kalimat penjelasan, tombol "Mulai Foto" dan "Lihat template", serta kolase tiga photostrip miring dengan aksen bintang (dibuat dengan CSS, bukan gambar).
3. **Cara Kerjanya:** pita berwarna `--accent` berisi empat kartu langkah: Pilih bingkai, Berpose, Atur, Unduh.
4. **Contoh template:** sampai lima thumbnail dari `GET /api/templates`. Kalau belum ada template aktif atau permintaannya gagal, bagian ini disembunyikan.
5. **Ajakan penutup** berlatar `--sun` dengan tombol "Mulai Foto", lalu footer kecil: nama produk, tahun, dan tautan "Masuk petugas" ke `/admin`.

Tidak ada angka statistik, testimoni, atau klaim yang tidak bisa dibuktikan.

## 4. Booth

### 4.1 Struktur kode

`public/js/app.js` v1 diganti dengan:

```
public/booth.html
public/js/booth/main.js          → inisialisasi, perpindahan layar, indikator langkah
public/js/booth/screens/welcome.js
public/js/booth/screens/pick.js
public/js/booth/screens/shoot.js
public/js/booth/screens/review.js
public/js/booth/screens/adjust.js
public/js/booth/screens/result.js
public/js/booth/overlay.js        → tata letak bingkai di atas kamera (murni)
public/js/booth/review-timer.js   → hitung mundur tinjau (murni)
public/js/kiosk.js                → status kiosk per perangkat, PIN, menu petugas
public/js/idle.js                 → timer menganggur (murni + pemasang event)
public/js/sound.js                → bip dan jepretan lewat Web Audio
public/js/i18n.js, public/js/i18n/id.js, public/js/i18n/en.js
public/js/theme.js, public/js/brand.js
```

Modul v1 tetap dipakai: `camera.js`, `strip.js`, `geometry.js`, `filters.js`, `state.js`, `api.js`, `slots.js`. Setiap layar mengekspor `enter(ctx)` dan `leave(ctx)`. `ctx` berisi state sesi, elemen bersama, dan fungsi `go(screen, params)`. `main.js` memastikan hanya satu layar aktif dan memanggil `leave` sebelum `enter` berikutnya.

### 4.2 Layar

1. **Sambutan (`welcome`)**
   - Di luar kiosk: kartu ringkas dengan judul, tombol "Mulai", pilihan bahasa, dan tombol tema. Banner browser dalam aplikasi dari v1 tetap ada di sini.
   - Di mode kiosk: layar penuh dengan judul besar, slideshow pelan thumbnail template aktif (berganti setiap 4 detik, berhenti bila `prefers-reduced-motion`), tombol besar "Ketuk untuk mulai", dan keterangan suara serta bahasa. Ketukan di mana saja memulai sesi.
   - Ketukan pertama juga membuka `AudioContext`, karena browser hanya mengizinkan suara setelah ada interaksi.

2. **Pilih template (`pick`)**
   - Grid kartu dengan pratinjau besar, nama, dan label jumlah foto.
   - Chip filter jumlah foto: "Semua" ditambah satu chip untuk setiap jumlah slot yang ada di antara template aktif.
   - Selama template dimuat, semua kartu terkunci dan tampil indikator "Memuat…" (perbaikan race v1 dipertahankan).
   - Mode ganti template dari layar Atur tetap seperti v1: konfirmasi kalau ada foto yang terbuang.

3. **Berpose (`shoot`)**
   - **Bingkai di kamera:** area pratinjau menampilkan potongan PNG template di sekitar slot yang sedang diisi, dengan video kamera tepat di lubang slot. Tamu langsung melihat komposisinya. Rinciannya di 4.3.
   - Angka hitung mundur besar ber-outline di tengah. Bip setiap detik, jepretan dan kilat saat foto diambil.
   - Indikator foto: deretan kotak kecil (sudah terisi / sedang / belum) dan teks "Foto 2 dari 3".
   - Tombol: Ambil foto, Batal (selama hitung mundur), balik kamera, pilih kamera, Galeri, layar penuh. Perilakunya sama dengan v1.
   - Di layar lebar (lebih dari 900 px dan berorientasi lanskap), pratinjau ada di kiri dan kontrol di kanan. Di layar lain kontrol ada di bawah.

4. **Tinjau (`review`)**
   - Setelah setiap jepretan, foto ditampilkan di dalam bingkai yang sama selama `review_seconds` detik, dengan batang waktu yang mengecil.
   - Tombol "Ulang" mengambil ulang slot yang sama. Tombol "Lanjut", atau waktu yang habis, lanjut ke slot berikutnya, atau ke layar Atur bila semua slot sudah terisi.
   - Kalau `review_seconds = 0`, layar ini dilewati.
   - Foto dari galeri tidak melewati layar tinjau.

5. **Atur (`adjust`)**
   - Kanvas di kiri dan panel di kanan. Di ponsel, panel turun ke bawah kanvas.
   - Foto yang dipilih bergaris `--accent`.
   - Pilihan filter berupa **thumbnail foto slot yang dipilih** dengan filter tersebut (sisi 96 px, dibuat sekali per foto per filter lalu disimpan di cache), bukan tombol teks.
   - Gestur, slider, tombol −/+, roda mouse, Ulang foto ini, dan Ganti bingkai sama dengan v1.

6. **Hasil (`result`)**
   - Strip besar di tengah dan tombol Unduh yang menonjol. Urutan percobaan unduh sama dengan v1.
   - Tombol tambahan: Atur lagi, Ulang sesi, dan Sesi baru.
   - Di mode kiosk, Sesi baru kembali ke layar sambutan, bukan ke pilih template.

### 4.3 Bingkai di kamera (`overlay.js`, murni)

`overlayLayout(template, slotIndex, { margin = 0.18 }) → { region, slot }`
- `region` adalah kotak slot yang diperluas `margin × max(slot.w, slot.h)` ke setiap sisi, lalu dipotong agar tetap di dalam kanvas. Satuannya piksel template.
- `slot` adalah posisi slot di dalam `region`, dalam persen (`left`, `top`, `width`, `height`).

Wadah pratinjau memakai rasio `region.w / region.h`.
- Video ditempatkan absolut di area `slot` dengan `object-fit: cover`. Pencerminan mengikuti aturan v1.
- Gambar template ditempatkan absolut, diskalakan dan digeser sehingga piksel `region` mengisi wadah.
- Di luar lubang slot, PNG template menutupi video. Bagian template di luar `region` terpotong oleh `overflow: hidden`.

Hasil tangkapan kamera tetap berupa frame penuh seperti v1. Overlay hanya untuk tampilan.

### 4.4 Peningkatan yang ikut dikerjakan

Bagian-bagian ini ditulis ulang, jadi Minor yang ditunda dari review v1 diselesaikan di sini:

- Hasil yang sudah disiapkan langsung dibatalkan begitu tamu kembali ke Atur. Persiapan yang masih berjalan juga diabaikan, dengan token versi yang naik di `invalidateResult`.
- Impor galeri mengunci tombol Ambil foto, dan setiap hasil dekode diabaikan bila layar sudah berganti.
- Wake Lock dilepas walau permintaannya baru selesai setelah tamu meninggalkan booth.
- Unduh yang diketuk dua kali hanya mengirim satu log sesi (ada penanda "sedang dikirim").
- Kanvas layar Atur hanya diubah ukurannya bila ukurannya berubah. Di luar itu cukup dibersihkan dan digambar ulang.
- Lembar share hanya dipakai bila `(pointer: coarse)` cocok, sehingga laptop layar sentuh Windows mendapat unduhan biasa.
- `PUT /api/admin/settings` memakai `Object.hasOwn`, sehingga kunci seperti `toString` ditolak 400.

## 5. Mode kiosk

### 5.1 Mengaktifkan dan keluar

- Status kiosk disimpan **per perangkat** di `localStorage` (`pb.kiosk = "1"`), sehingga ponsel tamu tidak pernah ikut terkunci.
- **Pintu petugas:** tekan lama 3 detik pada logo booth, atau pada area 64×64 px di pojok kanan atas saat kiosk aktif. Selama ditekan tampil cincin progres tipis.
- Setelah itu muncul dialog PIN berupa papan angka besar. PIN diperiksa ke server (5.3).
- PIN benar membuka **menu petugas**: Aktifkan/Nonaktifkan kiosk, Layar penuh, Suara nyala/mati, Bahasa default perangkat, Tema, dan Muat ulang.
- Kalau admin belum mengatur PIN (`kiosk_available = false`), tekan lama tidak membuka dialog PIN. Yang muncul hanya keterangan "Mode kiosk butuh PIN. Atur PIN di halaman Pengaturan admin."

### 5.2 Perilaku saat kiosk aktif

- **Layar terkunci:**
  - Booth meminta layar penuh saat sesi dimulai, bila didukung.
  - Tombol keluar, layar penuh, dan tautan ke landing disembunyikan.
  - Wake Lock aktif di semua layar.
  - Menu konteks (`contextmenu`) dan pilih teks dimatikan di area booth.
  - Di iPhone/iPad (tanpa Fullscreen API), README menyarankan memakai fitur **Akses Terpandu** (Guided Access) iOS.
- **Reset otomatis (`idle.js`):**
  - Timer berjalan di semua layar kecuali sambutan. Setiap `pointerdown`, `keydown`, dan `wheel` mengulangnya dari awal. Hitung mundur, pengambilan foto, dan layar tinjau tidak dihitung sebagai menganggur.
  - Pada `kiosk_idle_seconds − 10` detik muncul toast "Masih di sana? Kembali ke awal dalam 10 dtk" dengan tombol "Lanjutkan".
  - Saat waktu habis: semua state sesi dibuang (`resetAll`, canvas dan object URL dilepas), dialog ditutup, lalu booth kembali ke layar sambutan. Kamera tetap menyala agar sesi berikutnya cepat.
  - Antarmuka murni: `createIdleTimer({ timeoutMs, warnMs, now })` dengan metode `activity()`, `pause()`, `resume()`, dan `tick() → 'idle' | 'warn' | 'expired'`. Diuji tanpa DOM, dengan jam palsu.
- **Suara (`sound.js`):**
  - Bip 880 Hz 80 ms setiap detik hitung mundur, bip 1320 Hz di detik terakhir, dan suara jepretan berupa derau putih pendek berenvelope.
  - Default diambil dari pengaturan `sound_default`, dan bisa diubah per perangkat (`pb.sound`).
  - Di luar kiosk, suara juga bisa dinyalakan atau dimatikan lewat ikon speaker di booth.
- **Bahasa default perangkat:** dipakai saat kembali ke layar sambutan. Tamu tetap bisa mengganti bahasa selama sesinya.

### 5.3 PIN di server

- Disimpan di tabel `settings` dengan kunci `kiosk_pin_hash` (bcrypt cost 10). Kunci ini **tidak** ada di `SETTINGS_SCHEMA`, sehingga tidak bisa diubah lewat `PUT /api/admin/settings` dan tidak ikut di `GET /api/settings`.
- `PUT /api/admin/kiosk-pin`, body `{ "pin": "1234" }`. PIN harus 4–8 digit (`/^\d{4,8}$/`), selain itu 422. Body `{ "pin": null }` menghapus PIN. Responsnya 204.
- `POST /api/kiosk/verify`, body `{ "pin": "1234" }`:
  - PIN benar → 200 `{ "ok": true }`.
  - PIN salah, atau PIN belum diatur → 401. Hash palsu tetap dibandingkan, supaya waktu responsnya sama.
  - Lebih dari 5 percobaan per 15 menit per IP → 429 dengan `Retry-After`.
  - `checkOrigin` berlaku.
- `GET /api/settings` ditambah `kiosk_available: boolean`, bernilai true bila PIN sudah diatur.
- Hash tidak pernah dikirim ke browser. PIN 4 digit yang hash-nya ada di browser bisa ditebak dalam hitungan detik.
- Kalau server tidak bisa dihubungi saat PIN diperiksa, tampil pesan "Tidak bisa memeriksa PIN. Periksa koneksi." README menjelaskan cara darurat keluar dari kiosk: tutup tab browser, atau hapus data situs.

## 6. Dua bahasa (`i18n.js`)

- Kamus berupa modul JavaScript (`i18n/id.js`, `i18n/en.js`) yang mengekspor objek datar `{ "booth.shoot.take": "Ambil foto", … }`. Tidak di-fetch, jadi tidak ada permintaan tambahan.
- `t(key, params)` mengganti penanda `{nama}` dengan nilai dari `params`, misalnya `"Foto {i} dari {n}"`. Kunci yang tidak ada di bahasa aktif jatuh ke bahasa Indonesia, lalu ke nama kuncinya sendiri, dan tercatat di `console.warn` sekali per kunci.
- Elemen HTML statis memakai `data-i18n="kunci"`; `applyI18n(root)` mengisi `textContent`. Atribut memakai `data-i18n-attr="aria-label:kunci"`.
- `cameraErrorMessage()` di `camera.js` mengembalikan **kunci** i18n, bukan teks.
- Pilihan bahasa tamu disimpan di `pb.lang`. Default: bahasa default perangkat (kiosk), lalu bahasa browser (`navigator.language` diawali `en` → English), lalu Indonesia.
- Cakupan: landing dan booth. Admin tetap berbahasa Indonesia. Pesan error dari server yang mungkin tampil di booth (gagal memuat template) diganti pesan umum dari kamus.

## 7. Admin

- **Tata letak bersama:** sidebar kiri (lebar 220 px) berisi logo, Dashboard, Template, Pengaturan, "Buka booth ↗", tombol tema, dan Keluar. Di bawah 768 px, sidebar menjadi bilah atas dengan menu lipat. Dibangun lewat fungsi `renderShell(active)` di `admin.js`, bukan disalin di setiap HTML.
- **Dashboard:**
  - Kartu angka: Sesi hari ini, Sesi 7 hari, Template aktif, Terpopuler.
  - Grafik batang sesi 14 hari terakhir: SVG yang dibangun dengan `createElementNS`, tanpa library. Hari ini disorot, dan setiap batang punya `<title>` berisi tanggal dan jumlah.
  - Daftar 5 terpopuler.
- **Template:** tabel template v1 (thumbnail, nama, ukuran, slot, status, pemakaian, aksi), ditambah pencarian nama dan filter status.
- **Editor template:** fungsinya sama dengan v1, dengan tampilan baru. Pratinjau menempel di kanan pada layar lebar.
- **Pengaturan:**
  - Kelompok **Booth:** hitung mundur, cermin hasil, `review_seconds`.
  - Kelompok **Kiosk:** batas menganggur, suara default, PIN (atur/ganti/hapus, dengan status "PIN sudah diatur" tanpa menampilkan PIN-nya).
- Aturan v1 tetap berlaku: tanpa `innerHTML` untuk data server, dan respons 401 di setiap panggilan mengarahkan ke halaman login.

## 8. Perubahan server

| Bagian | Perubahan |
|---|---|
| `server.js` | route `GET /booth` → `booth.html`; route kiosk |
| `db/index.js` | `SETTINGS_SCHEMA` ditambah `kiosk_idle_seconds` (30–600, default 90), `review_seconds` (0–10, default 3), `sound_default` (0–1, default 1) |
| `routes/settings.js` | `Object.hasOwn`; `GET` menambah `kiosk_available` |
| `routes/kiosk.js` (baru) | `PUT /api/admin/kiosk-pin`, `POST /api/kiosk/verify` + rate limit `KIOSK_VERIFY_LIMIT = 5` per 15 menit |
| `routes/stats.js` | `GET /api/admin/stats` menambah `sessions_7d` (7 hari lokal terakhir termasuk hari ini) dan `daily: [{ date: 'YYYY-MM-DD', count }]` untuk 14 hari lokal terakhir, urut lama → baru, hari tanpa sesi bernilai 0 |
| `lib/time.js` | `localDate(now, tz) → 'YYYY-MM-DD'` dan `dayBoundsUTCForDate(dateStr, tz)` untuk menghitung batas tiap hari |

CSP tidak berubah. Font dan audio tidak butuh sumber luar.

## 9. Pengujian

**Otomatis** (`node:test`, sama seperti v1):
- `overlay.js`: region diperluas dan dipotong di tepi kanvas; posisi slot dalam persen; slot di pojok kanvas.
- `idle.js`: status idle → warn → expired dengan jam palsu; `activity()` mengulang; `pause()`/`resume()`.
- `review-timer.js`: waktu habis → lanjut; `review_seconds = 0` dilewati; batal saat Ulang ditekan.
- `i18n.js`: interpolasi; fallback ke Indonesia lalu ke kunci; **`en.js` punya semua kunci `id.js`, dan sebaliknya**.
- `camera.js`: `cameraErrorMessage` mengembalikan kunci yang ada di kamus.
- API: pengaturan baru (rentang, default, `toString` → 400), PIN (format, hapus, verify benar/salah/belum diatur/429, hash tidak bocor di `GET /api/settings`), statistik `sessions_7d` dan `daily` dengan jam palsu dan TZ Jakarta (termasuk hari kosong).
- Server: `GET /booth` → 200 HTML; `GET /` → landing.
- Penjaga CSP v1 mencakup semua HTML baru.
- Seluruh tes v1 tetap lulus. Tes yang memeriksa teks error kamera disesuaikan ke kunci i18n.

**Browser** (Chrome headless + kamera palsu, seperti v1):
- Landing → booth → sesi penuh dengan layar tinjau → unduh, dalam bahasa Indonesia dan English.
- Kiosk: aktifkan lewat PIN; menganggur → peringatan → kembali ke sambutan dengan state kosong; keluar dengan PIN; PIN salah 6 kali → pesan rate limit.
- Tema terang dan gelap.
- Screenshot di 390×844 (ponsel), 820×1180 (tablet potret), dan 1440×900 (desktop), tanpa scroll horizontal dan tanpa error konsol/CSP.

**Manual:** `docs/manual-test.md` ditambah baris untuk kiosk (Guided Access di iPad, layar penuh di Android), suara di iOS setelah ketukan pertama, bingkai di kamera di setiap perangkat, dan tema gelap di ruangan redup.

## 10. Di luar cakupan A

- Acara, kode/link per acara, branding klien (B)
- QR, unggah hasil, galeri (C)
- Stiker, teks, GIF (D)
- Akun penyelenggara dan pembayaran (E)
- Halaman FAQ/privasi/kontak, katalog template publik terpisah, admin dua bahasa

## 11. Risiko

| Risiko | Penanganan |
|---|---|
| Pemecahan `app.js` merusak alur v1 yang sudah teruji | Modul v1 dipertahankan; uji browser v1 diulang di struktur baru sebelum fitur baru ditambahkan |
| Bingkai di kamera tidak pas di beberapa rasio layar | Fungsi murni `overlayLayout` diuji; screenshot di tiga ukuran |
| Suara diblokir browser | `AudioContext` dibuka pada ketukan pertama; booth tetap jalan tanpa suara |
| Kiosk tidak bisa dikunci penuh di iOS | Akses Terpandu dijelaskan di README; wake lock dan menu konteks tetap ditangani |
| Petugas tidak bisa keluar kiosk saat offline | Pesan jelas; cara darurat di README |
| PIN ditebak | Pemeriksaan hanya di server, rate limit 5/15 menit, bcrypt |
| Font menambah ukuran halaman | Subset Latin `.woff2`, `font-display: swap` |
