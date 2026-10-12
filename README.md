# Photobooth

Photobooth digital berbasis browser. Desain: [docs/superpowers/specs/2026-10-12-photobooth-design.md](docs/superpowers/specs/2026-10-12-photobooth-design.md).

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

Admin: `http://localhost:3000/admin`.

## Seed

- Buat admin: `npm run seed:admin -- <user> <pass>`
- Ganti password: `npm run seed:admin -- --reset <user> <pass>`
- Template contoh (aktif, 3 slot lanskap): `npm run seed:sample`

## Backup

`npm run backup` menyalin database **dan** folder `uploads/templates` bersama-sama ke `backups/<YYYY-MM-DD-HHmmss>/`. Keduanya harus selalu dipulihkan bersama, karena database menyimpan nama file template.

## Deploy

## Catatan kamera
