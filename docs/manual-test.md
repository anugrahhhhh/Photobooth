# Checklist uji lintas perangkat

Jalankan lewat HTTPS, karena kamera tidak berfungsi tanpa HTTPS (kecuali `localhost`):

```bash
npm start
cloudflared tunnel --url http://localhost:3000
```

Isi tiap sel dengan ✅ (lolos), ❌ (gagal, tulis catatan di bawah), atau – (tidak berlaku).

| # | Kasus | Chrome laptop + webcam bawaan | Webcam USB | Chrome Android | Safari iPhone/iPad |
|---|---|---|---|---|---|
| 1 | Sesi penuh: pilih template → foto → atur → unduh | ✅ (otomatis, kamera palsu) | | | |
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
| 12 | Filter Normal, Hitam putih, Sepia | ✅ (otomatis) | | | |
| 13 | Unduh: file JPEG tersimpan, nama `photobooth-YYYYMMDD-HHmmss.jpg` | ✅ (otomatis) | | | |
| 14 | Berbagi (lembar share) di ponsel, termasuk membatalkan lembar share (tidak ada pesan error) | – | – | | |
| 15 | Unggah dari galeri, termasuk foto potret dengan orientasi EXIF | ✅ JPEG/PNG (otomatis) | | | |
| 16 | File HEIC atau rusak: pesan per file | ✅ file rusak (otomatis) | | | |
| 17 | Browser dalam aplikasi (buka link dari Instagram/WhatsApp/Line): banner "Buka di Chrome/Safari" | – | – | | |
| 18 | Admin: login, unggah template, aktifkan, template tampil di booth — lewat tunnel (cek Origin) | | | | |
| 19 | Aset tidak diblokir CSP di HTTP lokal dan di tunnel (Review Focus 5); tidak ada error di konsol | ✅ HTTP lokal (otomatis) | | | |
| 20 | Hasil sesuai pengaturan cermin (`mirror_output` 0 dan 1) untuk kamera depan | | | | |

"Otomatis" berarti diuji dengan Chrome headless dan kamera palsu (`--use-fake-device-for-media-stream`) pada 2026-10-12. Uji ulang di perangkat sungguhan tetap diperlukan.

## Catatan

-
