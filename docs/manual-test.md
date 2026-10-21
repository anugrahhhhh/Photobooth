# Checklist uji lintas perangkat

Jalankan lewat HTTPS, karena kamera tidak berfungsi tanpa HTTPS (kecuali `localhost`):

```bash
npm start
cloudflared tunnel --url http://localhost:3000
```

Isi tiap sel dengan ✅ (lolos), ❌ (gagal, tulis catatan di bawah), atau – (tidak berlaku).

| # | Kasus | Chrome laptop + webcam bawaan | Webcam USB | Chrome Android | Safari iPhone/iPad |
|---|---|---|---|---|---|
| 1 | Sesi penuh: landing → booth → pilih template → foto → tinjau → atur → unduh, dalam Indonesia dan English, tema terang dan gelap | ✅ (otomatis, kamera palsu, 390/820/1440 px) | | | |
| 2 | Izin kamera ditolak: pesan panduan muncul, galeri tetap bisa dipakai | | | | |
| 3 | Balik kamera (depan ↔ belakang), pratinjau dicermin hanya untuk kamera depan | – | – | | |
| 4 | Pilih kamera dari daftar; pilihan diingat setelah muat ulang | | | | |
| 5 | Ganti kamera tidak memicu restart berulang (Review Focus 4) | | | | |
| 6 | Webcam dicabut saat di booth: kamera dinyalakan ulang atau muncul pesan setelah 3 kali gagal | – | | – | – |
| 7 | Rotasi layar di booth dan di layar Atur | – | – | | |
| 8 | Tab ke latar belakang lalu kembali: kamera hidup lagi, layar tidak mati (Wake Lock) | | | | |
| 9 | Batal di tengah hitung mundur | ✅ (otomatis) | | | |
| 10 | Ganti template 3→2 slot (konfirmasi) dan 2→3 slot (lanjut foto slot ke-3) | ✅ (otomatis) | | | |
| 11 | Geser, cubit, slider, dan tombol −/+ zoom; foto tidak pernah memperlihatkan latar di slot | ✅ geser/slider/tombol (otomatis) | | | |
| 12 | Filter Normal, Hitam putih, Sepia, Hangat, Dingin, Kontras | ✅ Hitam putih (otomatis) | | | |
| 12a | Zoom dengan roda mouse di layar Atur (desktop) | ✅ (otomatis, WheelEvent) | | – | – |
| 13 | Unduh: file JPEG tersimpan, nama `photobooth-YYYYMMDD-HHmmss.jpg` | ✅ (otomatis) | | | |
| 14 | Berbagi (lembar share) di ponsel, termasuk membatalkan lembar share (tidak ada pesan error) | – | – | | |
| 15 | Unggah dari galeri, termasuk foto potret dengan orientasi EXIF | ✅ JPEG/PNG (otomatis) | | | |
| 16 | File HEIC atau rusak: pesan per file | ✅ file rusak (otomatis) | | | |
| 17 | Browser dalam aplikasi (buka link dari Instagram/WhatsApp/Line): banner "Buka di Chrome/Safari" | – | – | | |
| 18 | Admin: login, unggah template, aktifkan, template tampil di booth — lewat tunnel (cek Origin) | | | | |
| 18a | Admin: deteksi slot otomatis dari PNG (indikator "Sedang memproses", peringatan 0 atau >8 area) | ✅ 2 slot (otomatis) | | | |
| 19 | Aset tidak diblokir CSP di HTTP lokal dan di tunnel (Review Focus 5); tidak ada error di konsol | ✅ HTTP lokal (otomatis) | | | |
| 20 | Hasil sesuai pengaturan cermin (`mirror_output` 0 dan 1) untuk kamera depan | | | | |
| 21 | Kiosk dengan Akses Terpandu di iPad (tombol samping 3x, layar terkunci di booth) | – | – | – | |
| 22 | Layar penuh kiosk di Chrome Android (masuk lewat ketukan "Ketuk untuk mulai", keluar lewat menu petugas) | – | – | | – |
| 23 | Suara hitung mundur dan rana di iOS setelah ketukan pertama | – | – | – | |
| 24 | Bingkai di kamera pas (tidak terpotong atau bergeser) di setiap perangkat | | | | |
| 25 | Tema gelap di ruangan redup: kontras terbaca, tidak ada kedipan terang saat muat | | | | |
| 26 | Tekan lama logo (3 detik) membuka PIN, di layar sentuh dan dengan mouse; lepas sebelum 3 detik tidak membuka apa pun | ✅ mouse (otomatis) | | | |
| 27 | Reset menganggur saat lembar share terbuka di ponsel: kembali ke sambutan tanpa error, lembar share tidak membangkitkan state lama | – | – | | |
| 28 | Lembar share dan overlay simpan iOS ("tekan lama gambar untuk menyimpan") di ponsel sungguhan; tidak bisa diuji headless | – | – | | |
| 29 | Mulai kiosk dengan ketukan di layar sentuh sungguhan (tombol "Ketuk untuk mulai" dan area layar); di laptop dengan klik, Enter, dan Spasi | ✅ klik/Enter/Spasi (otomatis) | | | |
| 30 | Kiosk: menganggur → peringatan 10 detik → kembali ke sambutan dengan state kosong; keluar dengan PIN | ✅ (otomatis, idle 30 detik) | | | |
| 31 | PIN salah 6 kali: pesan batas percobaan muncul (rate limit 5 per 15 menit) | ✅ (otomatis) | | | |
| 32 | `localStorage` diblokir (mode privat atau data situs diblokir): satu sesi penuh tetap selesai | ✅ (otomatis, storage dibuat melempar) | | | |
| 33 | Bahasa dan tema dari landing terbawa ke booth; admin tetap Indonesia dan mengikuti tema | ✅ (otomatis) | | | |
| 34 | Tidak ada scroll horizontal dan tidak ada error konsol/CSP di landing, booth, dan admin pada 390, 820, dan 1440 px | ✅ (otomatis) | | | |

"Otomatis" berarti diuji dengan Chrome headless dan kamera palsu (`--use-fake-device-for-media-stream`) pada 2026-10-12 (baris 1-20) dan 2026-10-21 (baris 1, 26, 29-34). Uji ulang di perangkat sungguhan tetap diperlukan.

## Catatan

-
