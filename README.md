# Photobooth

Photobooth digital berbasis browser. Desain: [docs/superpowers/specs/2026-10-12-photobooth-design.md](docs/superpowers/specs/2026-10-12-photobooth-design.md); desain ulang landing, booth, admin, dan kiosk: [docs/superpowers/specs/2026-10-12-redesign-kiosk-design.md](docs/superpowers/specs/2026-10-12-redesign-kiosk-design.md).

Butuh Node.js 22.9 atau lebih baru.

## Env

Salin `.env.example` menjadi `.env` lalu sesuaikan. `.env` dibaca otomatis oleh skrip npm.

| Env | Default | Keterangan |
|---|---|---|
| `PORT` | 3000 | |
| `DB_PATH` | `./data/photobooth.db` | Harus berada di disk persisten |
| `UPLOAD_DIR` | `./uploads` | Template disimpan di `<UPLOAD_DIR>/templates`; harus berada di disk persisten |
| `SESSION_SECRET` | — | Wajib di produksi, string acak panjang. Server menolak jalan jika kosong atau masih sama dengan contoh |
| `TZ` | `Asia/Jakarta` | Dipakai untuk menghitung "sesi hari ini" |
| `NODE_ENV` | `development` | `production` mengaktifkan cookie `secure`, `trust proxy`, dan `upgrade-insecure-requests` |

Contoh membuat secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Menjalankan

```bash
npm install
npm run seed:admin -- admin <password-minimal-8-karakter>
npm run dev        # atau: npm start
npm test
```

Landing: `http://localhost:3000/`. Booth: `http://localhost:3000/booth`. Admin: `http://localhost:3000/admin`.

## Seed

- Buat admin: `npm run seed:admin -- <user> <pass>`
- Ganti password: `npm run seed:admin -- --reset <user> <pass>`
- Template contoh (aktif, 3 slot lanskap): `npm run seed:sample`

## Backup

`npm run backup` menyalin database **dan** folder `uploads/templates` bersama-sama ke `backups/<YYYY-MM-DD-HHmmss>/`. Keduanya harus selalu dipulihkan bersama, karena database menyimpan nama file template.

## Deploy

**Di balik reverse proxy** (nginx dan sejenisnya), di produksi server memakai `trust proxy` dan butuh header berikut. Tanpa header ini, login admin gagal: `checkOrigin` menolak dengan 403 atau cookie `secure` tidak terpasang.

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Reset password lewat `seed:admin -- --reset` langsung mengakhiri semua sesi user itu.

**Syarat lain:**
- **HTTPS wajib.** Browser hanya mengizinkan kamera di HTTPS (atau `localhost`). Tanpa HTTPS, booth menampilkan pesan "Kamera hanya bisa dipakai jika situs dibuka lewat HTTPS".
- **Satu instance saja.** SQLite dan folder uploads ada di disk lokal. Pastikan platform tidak menjalankan dua instance bersamaan pada volume yang sama, termasuk saat deploy bergulir.
- **Disk persisten** untuk `DB_PATH` dan `UPLOAD_DIR` (Railway, Fly.io, Render dengan disk, atau VPS). Vercel, Netlify, dan sejenisnya tidak bisa dipakai.
- **Nginx:** `client_max_body_size 6m;` (PNG template maksimal 5 MB ditambah thumbnail).
- **Penyimpanan di domain lain** (misalnya pindah ke object storage nanti): domain itu wajib mengirim header CORS (`Access-Control-Allow-Origin`), karena gambar template dimuat dengan `crossOrigin = 'anonymous'` agar hasil bisa diekspor dari canvas.

**Uji dari ponsel saat pengembangan:**

```bash
npm start
cloudflared tunnel --url http://localhost:3000   # atau: ngrok http 3000
```

Checklist uji lintas perangkat ada di [docs/manual-test.md](docs/manual-test.md).

## Catatan kamera

- Webcam laptop selalu memberi frame lanskap. Untuk slot potret 1100×1700 dari frame 1920×1080, area yang terpakai hanya sekitar **699×1080**, sehingga foto diperbesar sekitar 1,6 kali dan terlihat kurang tajam.
- Ponsel dalam posisi potret biasanya memberi frame potret, jadi masalah ini tidak terjadi di sana.
- **Saran untuk admin:** pakai slot lanskap jika booth memakai webcam laptop.
- Pratinjau kamera depan selalu dicermin. Hasil foto dicermin hanya jika "Cerminkan hasil foto kamera depan" aktif di dashboard. Kamera belakang dan foto dari galeri tidak pernah dicermin.

## Mode kiosk

Mode kiosk mengunci booth untuk dipakai tamu tanpa petugas: layar sambutan penuh, tombol keluar disembunyikan, layar tetap menyala, dan sesi kembali ke awal sendiri bila ditinggalkan.

- **Atur PIN:** di admin, buka Pengaturan lalu isi PIN petugas (4-8 digit). Tanpa PIN, kiosk tidak bisa diaktifkan. Lama menganggur sebelum reset diatur lewat `kiosk_idle_seconds` (30-600 detik).
- **Masuk dan keluar:** tekan lama logo selama 3 detik (di layar sambutan kiosk, tekan lama sudut kanan atas layar), masukkan PIN, lalu pilih "Aktifkan kiosk" atau "Nonaktifkan kiosk" di menu petugas. Status disimpan per perangkat. Bila kiosk sedang menyala dan PIN sudah dihapus admin, tekan lama langsung membuka menu petugas (tidak ada lagi yang dilindungi) supaya kiosk tetap bisa dimatikan.
- **iPhone dan iPad:** Safari tidak punya layar penuh untuk halaman web, jadi aktifkan **Akses Terpandu**: Pengaturan > Aksesibilitas > Akses Terpandu, nyalakan, lalu buka booth dan tekan tombol samping tiga kali untuk memulai.
- **PIN salah:** setelah 5 kali salah dari satu alamat IP, verifikasi dikunci 15 menit (booth menampilkan pesan batas percobaan). Hanya percobaan gagal yang dihitung.
- **Darurat, server tidak bisa dihubungi:** PIN diperiksa di server, jadi tanpa koneksi kiosk tidak bisa dimatikan lewat menu. Status kiosk tersimpan di perangkat (bertahan walau tab ditutup dan dibuka lagi), jadi satu-satunya jalan keluar adalah menghapus data situs untuk alamat booth di pengaturan browser (ini menghapus status kiosk di perangkat itu).
