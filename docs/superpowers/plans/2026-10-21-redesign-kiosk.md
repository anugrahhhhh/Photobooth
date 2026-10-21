# Sub-proyek A: Redesain UI dan Mode Kiosk — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti tampilan v1 dengan sistem visual baru (gaya ceria untuk landing dan booth, gaya bersih untuk admin, tema terang/gelap), memecah booth menjadi layar-layar modular dengan bingkai di kamera, layar tinjau, suara, dan dua bahasa, serta menambahkan mode kiosk yang terkunci PIN dan reset otomatis.

**Architecture:** Server tetap `createApp` dari v1. Ditambah route kiosk (`routes/kiosk.js`), tiga pengaturan baru, statistik 7/14 hari, dan route `/booth`. Frontend tetap vanilla ES modules tanpa build. `public/js/app.js` dipecah menjadi `public/js/booth/main.js` (pengatur layar) dan satu modul per layar dengan `init/enter/leave`. Logika yang bisa diuji (overlay, idle, review timer, i18n, result store, wake lock, model chip, grafik admin) ditulis sebagai fungsi murni dan diuji dengan `node:test`.

**Tech Stack:** Node.js 24 (ESM), Express 5, better-sqlite3, bcrypt, express-rate-limit, helmet. Tes memakai `node:test` dan `supertest`. Uji browser memakai Chrome headless dengan `--use-fake-device-for-media-stream` (skill `playwright` atau `agent-browser`; skripnya tidak di-commit).

**Spec:** `docs/superpowers/specs/2026-10-12-redesign-kiosk-design.md` (spec A), dibaca bersama `docs/superpowers/specs/2026-10-12-photobooth-design.md` (v1). Nomor § merujuk ke spec A.

## Global Constraints

- Tanpa build tool, tanpa dependensi runtime baru. Font diunduh sekali lalu di-commit sebagai file.
- CSP tidak berubah: `default-src 'self'`. Tidak ada `<script>` tanpa `src`, tidak ada atribut `on*=`, tidak ada Google Fonts atau CDN. `test/html-csp.test.js` memindai semua HTML baru.
- Foto tamu tidak pernah dikirim ke server.
- Nama produk hanya ada di `public/js/brand.js` (`PRODUCT_NAME = 'Photobooth'`). HTML statis boleh memuat "Photobooth" di `<title>` dan sebagai teks awal sebelum JS jalan.
- Kunci `localStorage`: `pb.theme`, `pb.lang`, `pb.kiosk`, `pb.sound`, `pb.kioskLang`, dan `pb.cameraId` (v1). Semua akses lewat `public/js/storage.js` yang membungkus try/catch.
- Teks landing dan booth hanya lewat i18n (`t()` atau `data-i18n`). Admin tetap berbahasa Indonesia tanpa i18n. Pesan error API tetap berbahasa Indonesia.
- Admin dan booth tidak pernah memakai `innerHTML` untuk data server. Pakai `textContent`, `createElement`, atau `createElementNS`.
- Elemen interaktif minimal 44×44 px, punya `:focus-visible`, dan animasi dimatikan di bawah `prefers-reduced-motion: reduce`.
- Pengaturan baru: `kiosk_idle_seconds` int 30–600 (default 90), `review_seconds` int 0–10 (default 3), `sound_default` int 0–1 (default 1).
- PIN kiosk: `/^\d{4,8}$/`, bcrypt dengan `BCRYPT_COST` dari `db/seed-admin.js`, disimpan di `settings.kiosk_pin_hash`. `KIOSK_VERIFY_LIMIT = 5` per 15 menit per IP.
- Git: buat cabang `feat/redesign-kiosk` dari `feat/photobooth-v1` (v1 belum di-merge ke `main`). **Satu commit per tahap**, lalu berhenti untuk diperiksa sebelum tahap berikutnya.
- Setiap akhir tahap, `npm test` harus lulus semua.

## Keputusan yang mengisi celah spec

1. **Tes v1 yang berubah karena spec.** `test/settings.test.js` dan `test/public.test.js` membandingkan seluruh objek pengaturan, jadi objek pembandingnya ditambah tiga kunci baru dan `kiosk_available`. `test/camera.test.js` diubah dari mencocokkan teks menjadi mencocokkan kunci i18n (§9). Asersi lain di tes v1 tidak diubah.
2. **Rate limit verify hanya menghitung percobaan gagal** (`skipSuccessfulRequests: true`), supaya petugas yang berkali-kali memasukkan PIN benar tidak ikut terkunci. PIN salah 6 kali tetap menghasilkan 429.
3. **Body verify yang tidak valid** (`pin` bukan string, tidak sesuai format, atau body kosong) → 401 setelah tetap membandingkan dengan hash palsu, bukan 422. Dengan begitu respons tidak membocorkan aturan format.
4. **`PUT /api/admin/kiosk-pin`**: kunci `pin` tidak ada, atau nilainya bukan string dan bukan `null` → 422.
5. **`PUT /api/admin/settings` tetap mengembalikan `getSettings(db)`**, tanpa `kiosk_available`. Halaman pengaturan admin membaca status PIN dari `GET /api/settings`.
6. **Tema:** `data-theme` di `<html>` selalu berisi nilai jadi, yaitu `light` atau `dark`. Untuk pilihan `system`, nilainya diturunkan dari `prefers-color-scheme` dan ikut berubah saat preferensi sistem berubah. Skrip klasik kecil `public/js/theme-boot.js` di `<head>` memasang atribut ini sebelum halaman tergambar, supaya tidak ada kedipan terang di ruangan gelap. CSS cukup memakai `[data-theme="dark"]`.
7. **Modul tambahan di luar daftar §4.1:** `public/js/storage.js`, `public/js/theme-boot.js`, `public/js/wake-lock.js`, `public/js/landing.js`, `public/js/booth/dom.js`, `public/js/booth/models.js`, `public/js/booth/result-store.js`, `public/js/booth/filter-thumbs.js`, `public/admin/common.js`, `public/admin/chart.js`, `public/admin/pages/{login,dashboard,templates,edit,settings}.js`, serta CSS `public/css/{tokens,components,landing,booth,admin}.css`. `public/js/app.js` dihapus di Tahap 3, dan `public/css/app.css` di Tahap 6.
8. **Alur Berpose ↔ Tinjau.** Setiap jepretan kamera membawa tamu ke `review` bila `review_seconds > 0`. "Lanjut" atau waktu habis membuka `shoot` dengan `{ auto: true }`, sehingga hitung mundur slot berikutnya langsung berjalan (meneruskan urutan seperti v1). Bila semua slot sudah terisi, atau tamu sedang mengulang satu slot, tujuannya `adjust`. "Ulang" membuka `shoot` dengan `{ target: slot, auto: true }`. Bila `review_seconds = 0`, `shoot` mengulang sendiri seperti v1.
9. **`idle.pause()` bertingkat.** Setiap `pause()` harus diimbangi satu `resume()`. Jam baru berjalan lagi, dan dimulai dari nol, ketika jumlah jeda kembali ke 0. Dengan begitu `main.js` (layar sambutan) dan layar Berpose/Tinjau tidak saling membatalkan jeda.
10. **Pembulatan overlay:** `pad = margin × max(slot.w, slot.h)`. Region: `x = max(0, floor(slot.x − pad))`, `y = max(0, floor(slot.y − pad))`, `right = min(canvas_w, ceil(slot.x + slot.w + pad))`, `bottom = min(canvas_h, ceil(slot.y + slot.h + pad))`. `overlayLayout` juga mengembalikan `image` (posisi PNG template dalam persen) supaya CSS tidak perlu menghitungnya.
11. **Thumbnail filter** memakai `filteredCanvas(photo, id, 96)` dari v1. Hasilnya seluruh foto diperkecil ke sisi 96 px, tanpa dipotong ke slot.
12. **Pratinjau tinjau** menggambar salinan foto (sisi ≤ 1024 px) di `<canvas id="review-photo">` dengan `object-fit: cover`. Canvas foto di `state.photos` tidak pernah dimasukkan ke DOM. Foto ditampilkan apa adanya (sudah mengikuti `mirror_output`), karena itulah yang akan masuk ke hasil.

## Review Focus

1. **Kunci i18n yang lupa ditambahkan.** String baru di HTML atau JS tanpa kunci di `id.js` akan tampil sebagai nama kunci mentah di depan tamu. Tes pemindai di Task 2.2 (`test/i18n-usage.test.js`) memeriksa semua `data-i18n`, `data-i18n-attr`, dan literal `t('…')` di landing/booth. Tes ini terus berjalan sampai Tahap 5.
2. **`localStorage` melempar error** (Safari mode privat, data situs diblokir). Booth harus tetap jalan dengan default: tema `system`, bahasa dari browser, kiosk mati, suara sesuai `sound_default`. Tesnya di Task 2.1, dengan storage palsu yang melempar di setiap metode.
3. **Reset menganggur di tengah pekerjaan async.** Hasil yang masih disiapkan, dekode galeri, atau `loadTemplateImage` yang selesai setelah reset tidak boleh menghidupkan kembali state lama. Hasil seperti itu dibuang dan object URL-nya dilepas. Tesnya di Task 3.1 (`result-store`) dan Task 5.1 (jeda bertingkat).
4. **Slot di tepi atau seluas kanvas.** Overlay harus menghasilkan region sama dengan kanvas tanpa NaN atau ukuran nol, dan persen slot tetap 0–100. Tesnya di Task 4.1.
5. **Tipe body PIN yang aneh.** `{ "pin": 1234 }`, `{ "pin": "12a4" }`, `{ "pin": "123456789" }`, `{}`, atau body bukan JSON: PUT → 422 (atau 400 untuk JSON rusak), verify → 401, tidak pernah 500. Tesnya di Task 1.2.

---

# TAHAP 1 — Server

- [ ] **Step 0: Buat cabang**

```bash
git checkout feat/photobooth-v1 && git checkout -b feat/redesign-kiosk
```

### Task 1.1: `lib/time.js` — tanggal lokal dan batas hari

**Files:**
- Modify: `lib/time.js`
- Test: `test/time.test.js`

**Interfaces:**
- Produces:
  - `localDate(now: Date, tz: string) -> 'YYYY-MM-DD'`
  - `addDays(dateStr: string, n: number) -> 'YYYY-MM-DD'`, dihitung dengan aritmetika kalender UTC
  - `dayBoundsUTCForDate(dateStr: string, tz: string) -> { start: ISO, end: ISO }`
  - `dayBoundsUTC(now, tz)` tetap ada dengan hasil yang sama, sekarang memanggil `dayBoundsUTCForDate(localDate(now, tz), tz)`

- [ ] **Step 1: Tambahkan tes yang gagal** ke `test/time.test.js`:

```js
test('localDate: Jakarta lewat tengah malam lokal', () => {
  assert.equal(localDate(new Date('2026-10-12T18:30:00Z'), 'Asia/Jakarta'), '2026-10-13');
  assert.equal(localDate(new Date('2026-10-12T16:59:59Z'), 'Asia/Jakarta'), '2026-10-12');
});

test('addDays: lintas bulan dan tahun', () => {
  assert.equal(addDays('2026-10-13', -13), '2026-09-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('dayBoundsUTCForDate: Jakarta dan hari 25 jam DST', () => {
  assert.deepEqual(dayBoundsUTCForDate('2026-10-13', 'Asia/Jakarta'), {
    start: '2026-10-12T17:00:00.000Z',
    end: '2026-10-13T17:00:00.000Z',
  });
  assert.deepEqual(dayBoundsUTCForDate('2026-11-01', 'America/New_York'), {
    start: '2026-11-01T04:00:00.000Z',
    end: '2026-11-02T05:00:00.000Z',
  });
});
```

- [ ] **Step 2:** `node --test test/time.test.js` → FAIL (`localDate` tidak diekspor).
- [ ] **Step 3: Implementasikan ketiga fungsi.** Pakai `wallClock` dan `localMidnight` yang sudah ada. Ubah `dayBoundsUTC` supaya memanggil fungsi baru.
- [ ] **Step 4:** `node --test test/time.test.js` → PASS (4 tes lama + 3 tes baru).

### Task 1.2: `routes/kiosk.js` — PIN kiosk

**Files:**
- Create: `routes/kiosk.js`
- Modify: `server.js` (pasang route)
- Test: `test/kiosk.test.js`

**Interfaces:**
- Consumes: `BCRYPT_COST` dari `db/seed-admin.js`, `checkOrigin`, `requireAdmin` (sudah terpasang di `/api/admin`)
- Produces:
  - `export const KIOSK_PIN_KEY = 'kiosk_pin_hash'`
  - `export const KIOSK_VERIFY_LIMIT = 5`
  - `export function hasKioskPin(db) -> boolean`
  - `export function kioskAdminRouter({ db })`, dipasang di `/api/admin/kiosk-pin` (menangani `PUT /`)
  - `export function kioskPublicRouter({ db })`, dipasang di `/api/kiosk` dengan `noStore, checkOrigin` (menangani `POST /verify`)

- [ ] **Step 1: Tulis tes yang gagal** `test/kiosk.test.js`. Pakai `makeTestApp`, `loginAgent`, `mutate`. Helper `setPin(body)` = `mutate(agent.put('/api/admin/kiosk-pin')).send(body)`, dan `verify(body)` = `mutate(request(ctx.app).post('/api/kiosk/verify')).send(body)`.
  - `PUT { pin: '1234' }` → 204; `hasKioskPin(ctx.db) === true`; nilai di DB diawali `$2` dan bukan `'1234'`.
  - `PUT` tanpa login → 401; tanpa Origin → 403.
  - `PUT` dengan `{ pin: '123' }`, `{ pin: '123456789' }`, `{ pin: '12a4' }`, `{ pin: 1234 }`, `{ pin: ' 1234' }`, `{}` → 422 untuk masing-masing, dan PIN lama tetap berlaku.
  - `PUT { pin: null }` → 204; `hasKioskPin` → false.
  - verify PIN benar → 200 `{ ok: true }`; PIN salah → 401 dengan `error` string; PIN belum diatur → 401.
  - verify dengan body `{ pin: 1234 }`, `{}`, `{ pin: ['1234'] }` → 401, bukan 500.
  - verify tanpa Origin → 403.
  - `KIOSK_VERIFY_LIMIT === 5`. Lima PIN salah → 401, percobaan ke-6 (walau PIN benar) → 429 dengan header `retry-after` > 0.
  - Lima PIN **benar** berturut-turut lalu satu PIN salah → semua 200, lalu 401 (Keputusan 2).
  - `GET /api/settings` tidak memuat `kiosk_pin_hash`, dan tidak ada nilai string yang diawali `$2` di respons.
- [ ] **Step 2:** `node --test test/kiosk.test.js` → FAIL (404).
- [ ] **Step 3: Implementasikan `routes/kiosk.js`** mengikuti pola `routes/auth.js`. Buat `DUMMY_HASH` sekali saat modul dimuat. Verify selalu menjalankan `bcrypt.compare(validPin ? pin : '', hash ?? DUMMY_HASH)`, dan hasilnya hanya dianggap benar bila hash asli ada, PIN valid, dan perbandingan cocok. Limiter: `windowMs: 15 * 60_000`, `limit: KIOSK_VERIFY_LIMIT`, `skipSuccessfulRequests: true`, `standardHeaders: 'draft-7'`, pesan `{ error: 'Terlalu banyak percobaan PIN. Coba lagi nanti.' }`. PUT melakukan upsert atau `DELETE FROM settings WHERE key = ?`. Pasang kedua router di `server.js`.
- [ ] **Step 4:** `node --test test/kiosk.test.js` → PASS.

### Task 1.3: Pengaturan baru dan `kiosk_available`

**Files:**
- Modify: `db/index.js`, `routes/settings.js`
- Test: `test/settings.test.js`, `test/public.test.js`, `test/db.test.js` (bila memeriksa jumlah baris default)

**Interfaces:**
- Consumes: `hasKioskPin(db)` (Task 1.2)
- Produces: `GET /api/settings` → `{ countdown_seconds, mirror_output, kiosk_idle_seconds, review_seconds, sound_default, kiosk_available }`. `PUT /api/admin/settings` → `getSettings(db)` (tanpa `kiosk_available`).

- [ ] **Step 1: Perbarui tes.** Buat konstanta `DEFAULTS = { countdown_seconds: 3, mirror_output: 0, kiosk_idle_seconds: 90, review_seconds: 3, sound_default: 1 }` di `test/settings.test.js`. Pembanding `GET` menjadi `{ ...DEFAULTS, kiosk_available: false }`, dan pembanding respons `PUT` menjadi `{ ...DEFAULTS, ...perubahan }`. Tambahkan tes:
  - `PUT { kiosk_idle_seconds: 29 }`, `{ kiosk_idle_seconds: 601 }`, `{ review_seconds: -1 }`, `{ review_seconds: 11 }`, `{ sound_default: 2 }` → 422. `{ kiosk_idle_seconds: 30 }`, `{ review_seconds: 0 }`, `{ sound_default: 0 }` → 200.
  - `PUT { toString: 1 }`, `{ constructor: 1 }`, `{ __proto__: 1 }` (dikirim sebagai string JSON mentah `'{"__proto__":1}'`) → 400, dan pengaturan tidak berubah.
  - Setelah `PUT /api/admin/kiosk-pin { pin: '1234' }`, `GET /api/settings` → `kiosk_available: true`.

  Ubah objek pembanding di tes `GET /api/settings publik tanpa login` di `test/public.test.js` dengan cara yang sama.
- [ ] **Step 2:** `node --test test/settings.test.js test/public.test.js` → FAIL.
- [ ] **Step 3: Implementasi.** Tambahkan ketiga kunci ke `SETTINGS_SCHEMA`. Di `routes/settings.js`, ganti semua `k in SETTINGS_SCHEMA` dengan `Object.hasOwn(SETTINGS_SCHEMA, k)` (juga di `getSettings`). Router publik mengembalikan `{ ...getSettings(db), kiosk_available: hasKioskPin(db) }`.
- [ ] **Step 4:** `npm test` → PASS semua.

### Task 1.4: Statistik `sessions_7d` dan `daily`

**Files:**
- Modify: `routes/stats.js`
- Test: `test/stats.test.js`

**Interfaces:**
- Consumes: `localDate`, `addDays`, `dayBoundsUTCForDate` (Task 1.1)
- Produces: `GET /api/admin/stats` → `{ templates, sessions_today, sessions_7d: number, daily: [{ date: 'YYYY-MM-DD', count: number }] × 14, top }`. `daily` urut dari tanggal lama ke baru, dan elemen terakhirnya hari ini.

- [ ] **Step 1: Tambahkan tes yang gagal** ke `test/stats.test.js` (jam palsu `2026-10-12T18:30:00Z` = 13 Okt WIB):
  - Tanpa sesi: `daily.length === 14`, `daily[0].date === '2026-09-30'`, `daily[13].date === '2026-10-13'`, semua `count === 0`, `sessions_7d === 0`.
  - Log di `2026-10-12T17:00:00.000Z` (13 Okt 00:00 WIB), `2026-10-06T17:00:00.000Z` (7 Okt 00:00 WIB, termasuk 7 hari), `2026-10-06T16:59:59.999Z` (6 Okt, di luar 7 hari), `2026-09-29T16:59:59.999Z` (29 Sep, di luar 14 hari), dan `2026-10-13T17:00:00.000Z` (besok). Hasil: `sessions_7d === 2`; `daily` untuk `'2026-10-13'` = 1, `'2026-10-07'` = 1, `'2026-10-06'` = 1; jumlah semua `count` = 3.
- [ ] **Step 2:** `node --test test/stats.test.js` → FAIL.
- [ ] **Step 3: Implementasi.** `today = localDate(now(), tz)`. Ambil `created_at` dalam rentang `[dayBoundsUTCForDate(addDays(today, -13)).start, dayBoundsUTCForDate(today).end)` dengan satu query. Kelompokkan per `localDate(new Date(created_at), tz)` ke dalam 14 tanggal yang sudah diisi 0. `sessions_7d` adalah jumlah 7 elemen terakhir.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit Tahap 1**

```bash
git add lib/time.js routes/kiosk.js routes/settings.js routes/stats.js db/index.js server.js test/
git commit -m "feat: kiosk PIN API, new settings, 7/14-day stats"
```

---

# TAHAP 2 — Fondasi frontend

### Task 2.1: `storage.js`, `brand.js`, `theme.js`, `theme-boot.js`

**Files:**
- Create: `public/js/storage.js`, `public/js/brand.js`, `public/js/theme.js`, `public/js/theme-boot.js`
- Modify: `public/js/camera.js` (`savedCameraId`/`saveCameraId` memakai `storage.js`)
- Test: `test/local-store.test.js` (nama `storage.test.js` sudah dipakai untuk `storage/index.js` server), `test/theme.test.js`

**Interfaces:**
- Produces:
  - `storage.js`: `KEYS = { theme: 'pb.theme', lang: 'pb.lang', kiosk: 'pb.kiosk', sound: 'pb.sound', kioskLang: 'pb.kioskLang', cameraId: 'pb.cameraId' }`; `read(key, store = globalThis.localStorage) -> string | null`; `write(key, value: string | null, store = globalThis.localStorage) -> void` (`null` = hapus). Keduanya tidak pernah melempar.
  - `brand.js`: `PRODUCT_NAME = 'Photobooth'`.
  - `theme.js`: `THEME_PREFS = ['system', 'light', 'dark']`; `readThemePref(store?) -> pref` (nilai tak dikenal → `'system'`); `nextThemePref(pref) -> pref` (urutan system → light → dark → system); `resolveTheme(pref, systemDark: boolean) -> 'light' | 'dark'`; `initTheme()` (memasang `data-theme` dan mendengarkan `matchMedia('(prefers-color-scheme: dark)')`); `bindThemeToggle(button)` (klik → simpan pref berikutnya, pasang ulang, perbarui `aria-label` dan ikon).
  - `theme-boot.js`: skrip **klasik** (bukan module) dengan logika `resolveTheme` yang sama, ditulis ulang dalam ±10 baris dan dibungkus try/catch. Dimuat di `<head>` setiap halaman lewat `<script src="/js/theme-boot.js"></script>`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `local-store.test.js`: dengan `throwing = { getItem() { throw new Error() }, setItem() { throw new Error() }, removeItem() { throw new Error() } }`, `read(KEYS.theme, throwing) === null` dan `write(KEYS.theme, 'dark', throwing)` tidak melempar. Dengan store berbasis `Map`, `write` lalu `read` mengembalikan nilai yang sama, dan `write(k, null)` menghapusnya. `read(k, undefined)` (tidak ada `localStorage` di Node) → `null`.
  - `theme.test.js`: `nextThemePref` untuk ketiga nilai; `resolveTheme('system', true) === 'dark'`, `resolveTheme('light', true) === 'light'`; `readThemePref` dengan store berisi `'ungu'` → `'system'`, dan dengan store yang melempar → `'system'`.
- [ ] **Step 2:** `node --test test/local-store.test.js test/theme.test.js` → FAIL.
- [ ] **Step 3: Implementasikan keempat file.** Bagian DOM di `theme.js` (`initTheme`, `bindThemeToggle`) baru menyentuh `document` di dalam fungsi, tidak saat modul dimuat, supaya modul bisa diimpor di Node.
- [ ] **Step 4:** `npm test` → PASS (termasuk `camera-start.test.js`).

### Task 2.2: i18n dan kunci error kamera

**Files:**
- Create: `public/js/i18n.js`, `public/js/i18n/id.js`, `public/js/i18n/en.js`
- Modify: `public/js/camera.js`
- Test: `test/i18n.test.js`, `test/i18n-usage.test.js`, `test/camera.test.js`

**Interfaces:**
- Consumes: `read`, `write`, `KEYS` (Task 2.1)
- Produces:
  - `id.js` / `en.js`: `export default { 'kunci.titik': 'teks', … }` (objek datar).
  - `createTranslator(dicts: { id, en }, { lang = 'id', warn = console.warn } = {}) -> { t(key, params?) -> string, setLang(lang), getLang() }`. Kunci yang hilang jatuh ke `id`, lalu ke nama kuncinya sendiri, dan `warn` dipanggil sekali per kunci.
  - `initialLang({ stored, deviceDefault, navigatorLang }) -> 'id' | 'en'`. Urutan: `stored` yang valid → `deviceDefault` yang valid → `navigatorLang` diawali `en` → `'id'`.
  - Instans default: `t`, `getLang`, `setLang(lang, { persist = true })` (menyimpan `pb.lang`, mengatur `document.documentElement.lang`, menjalankan `applyI18n(document)`, lalu memanggil setiap pendengar), `onLangChange(cb)`, `applyI18n(root)`, dan `bindLangSelect(select)`.
  - `applyI18n(root)`: `[data-i18n]` → `textContent = t(key)`. `[data-i18n-attr="attr:key;attr2:key2"]` → `setAttribute`.
  - `cameraErrorMessage(err)` mengembalikan salah satu dari `'camera.error.insecure' | 'camera.error.denied' | 'camera.error.notFound' | 'camera.error.busy' | 'camera.error.generic'`. `listCameras()` mengembalikan `label: d.label || ''`, dan pemanggil memakai `t('booth.shoot.cameraN', { n: i + 1 })` bila label kosong.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `i18n.test.js`:
    - `t('x', { i: 2, n: 3 })` dengan kamus `{ x: 'Foto {i} dari {n}' }` → `'Foto 2 dari 3'`. Penanda tanpa parameter dibiarkan apa adanya.
    - Dengan `lang: 'en'` dan kamus `{ id: { a: 'A-id' }, en: {} }`: `t('a') === 'A-id'`. `t('tidak.ada') === 'tidak.ada'`. Dua kali `t('tidak.ada')` → `warn` dipanggil sekali.
    - Paritas: `Object.keys(en).sort()` sama dengan `Object.keys(id).sort()`, dan tidak ada nilai string kosong.
    - Untuk setiap `f` di `FILTERS`, kunci `` `filter.${f.id}` `` ada di `id` (kunci ini dibentuk dinamis, jadi tidak tertangkap pemindai).
    - `initialLang`: `{ stored: 'en' }` → `'en'`; `{ stored: 'fr', deviceDefault: 'en' }` → `'en'`; `{ navigatorLang: 'en-GB' }` → `'en'`; `{ navigatorLang: 'ms-MY' }` → `'id'`; `{}` → `'id'`.
  - `i18n-usage.test.js`: kumpulkan kunci dari `public/index.html`, `public/booth.html` (`data-i18n="…"`, `data-i18n-attr` dipecah di `;` dan `:`), dan dari semua `public/js/**/*.js` kecuali `public/js/i18n/`, dengan regex `/\bt\('([a-zA-Z0-9_.]+)'/g`. Setiap kunci harus ada di `id.js`. Bila file HTML belum ada, file itu dilewati.
  - `camera.test.js`: ganti asersi teks menjadi `assert.equal(cameraErrorMessage(err('NotAllowedError')), 'camera.error.denied')` dan seterusnya sesuai tabel `switch` v1 (`SecurityError` → denied, `DevicesNotFoundError` → notFound, `TrackStartError` dan `AbortError` → busy, `null` → generic). Ganti tes "panduan per browser" menjadi: teks `id['camera.error.denied']` memuat `Chrome` dan `Safari`, dan setiap kunci yang dikembalikan ada di `id` dan `en`.
- [ ] **Step 2:** `node --test test/i18n.test.js test/i18n-usage.test.js test/camera.test.js` → FAIL.
- [ ] **Step 3: Implementasi.** Pindahkan teks error kamera v1 apa adanya ke `id.js`, lalu terjemahkan ke `en.js`. Isi kamus dengan kunci `common.*` (Mulai, tema, bahasa, Tutup, Coba lagi) dan `filter.<id>` untuk keenam filter (`normal`, `bw`, `sepia`, `warm`, `cool`, `contrast`, mengikuti `id` di `FILTERS`). Kunci layar ditambahkan oleh task yang membuat layarnya.
- [ ] **Step 4:** `npm test` → PASS.

### Task 2.3: Token, font, dan komponen

**Files:**
- Create: `public/css/tokens.css`, `public/css/components.css`, `public/fonts/*.woff2`, `public/fonts/OFL-*.txt`
- Test: `test/tokens.test.js`

**Interfaces:**
- Produces:
  - `tokens.css`: `@font-face` untuk `"Bricolage Grotesque"` 800 dan `"Plus Jakarta Sans"` 400/600/700 (`font-display: swap`). Blok token: `[data-skin="fun"]`, `[data-skin="fun"][data-theme="dark"]`, `[data-skin="clean"]`, `[data-skin="clean"][data-theme="dark"]`, dengan nama dan nilai persis dari tabel §2.1. Karena di gelap teks `--ink` terang tetapi outline dan bayangan tetap hitam, tambahkan `--line` (terang: `var(--ink)`, gelap: `#000000`), lalu `--outline: 2.5px solid var(--line)`, `--shadow: 3px 3px 0 var(--line)`, dan `--shadow-lg: 5px 5px 0 var(--line)`. Keempat blok juga mendefinisikan `--font-display`, `--font-body`, `--radius`, `--tap: 44px`, dan `--tap-lg: 56px`. Gaya `clean` mendefinisikan `--outline: 1px solid var(--border)`, `--shadow: 0 1px 2px rgb(0 0 0 / 6%)`, dan `--on-primary` (`#FFFFFF` di terang, `#16161A` di gelap), supaya komponen cukup ditulis satu kali.
  - `components.css`: class `.btn` (+ `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-icon`, `.btn-lg`), `.card`, `.chip` (`[aria-pressed="true"]` aktif), `.input`, `.range`, `.switch`, `.dialog` (`<dialog>`), `.toast`, `.progress-bar`, `.steps`, `.status-msg` (`.error`, `.ok`), `.visually-hidden`. Judul berpola `.display` (outline teks hanya di `[data-skin="fun"]`). Ditambah aturan global `:focus-visible` dan `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 1: Unduh font** ke folder scratch, bukan ke proyek:

```bash
cd <scratch> && npm pack @fontsource/bricolage-grotesque @fontsource/plus-jakarta-sans && for f in *.tgz; do tar xzf "$f" --one-top-level; done
```

  Salin `bricolage-grotesque-latin-800-normal.woff2`, `plus-jakarta-sans-latin-{400,600,700}-normal.woff2`, dan file `LICENSE` masing-masing (sebagai `OFL-bricolage.txt` dan `OFL-jakarta.txt`) ke `public/fonts/`. Ukuran total harus di bawah 200 KB (cek dengan `ls -l public/fonts`).
- [ ] **Step 2: Tulis tes yang gagal** `test/tokens.test.js`. Tes ini membaca `tokens.css`, mengurai setiap blok selector menjadi peta `--nama → nilai hex`, lalu menghitung kontras WCAG (fungsi `luminance` dan `contrast` ditulis di dalam file tes). Rasio minimal 4.5 untuk pasangan berikut:
  - fun terang/gelap: `--ink` di `--bg` dan di `--surface`; `--muted` di `--bg` dan di `--surface`; `--on-primary` di `--primary`.
  - clean terang/gelap: `--text` di `--bg` dan di `--surface`; `--muted` di `--surface`; `--on-primary` di `--primary`.

  Tambahkan juga asersi bahwa `--primary` fun terang = `#FF5A4E` dan clean terang = `#D93A2F`, sebagai penjaga salin-tempel dari spec. Juga asersi bahwa setiap `url(...)` di `@font-face` menunjuk ke file yang ada di `public/fonts/`.
- [ ] **Step 3:** `node --test test/tokens.test.js` → FAIL.
- [ ] **Step 4: Tulis `tokens.css` dan `components.css`.** Catatan: `--muted #71717A` di atas `--bg #FAFAF9` (clean) rasionya ±4,6, jadi masih lulus. Kalau ada pasangan yang ternyata gagal, catat di laporan tahap dan gelapkan nilainya seminimal mungkin. Jangan menurunkan ambang di tes.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit Tahap 2**

```bash
git add public/js/storage.js public/js/brand.js public/js/theme.js public/js/theme-boot.js public/js/i18n.js public/js/i18n public/js/camera.js public/css/tokens.css public/css/components.css public/fonts test/
git commit -m "feat: design tokens, fonts, theme and i18n foundations"
```

---

# TAHAP 3 — Booth modular dan landing (setara v1 + perbaikan §4.4)

Tahap ini memindahkan perilaku v1 ke struktur baru **tanpa** fitur booth baru. Bingkai di kamera, layar tinjau, suara, dan thumbnail filter dikerjakan di Tahap 4. Di akhir tahap, uji browser v1 diulang (risiko pertama di §11).

### Task 3.1: Modul murni pendukung booth

**Files:**
- Create: `public/js/booth/result-store.js`, `public/js/wake-lock.js`, `public/js/booth/models.js`
- Modify: `public/js/state.js`, `public/js/strip.js`
- Test: `test/result-store.test.js`, `test/wake-lock.test.js`, `test/models.test.js`, `test/state.test.js`, `test/strip.test.js`

**Interfaces:**
- Produces:
  - `createResultStore({ createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL } = {}) -> { begin() -> number, commit(job: number, file: File) -> boolean, invalidate(), current() -> { file, url } | null }`. `invalidate()` melepas URL yang ada dan menaikkan versi. `commit` dengan job lama mengembalikan false dan tidak membuat URL.
  - `createWakeLock(request = () => navigator.wakeLock?.request('screen')) -> { acquire(): Promise<void>, release(): void, held() -> boolean }`. Bila `release()` dipanggil sebelum `request` selesai, sentinel yang datang belakangan langsung di-`release()`. `acquire()` yang dipanggil saat kunci sudah dipegang tidak membuat permintaan baru.
  - `slotCountChips(templates) -> Array<null | number>`: `null` = "Semua", diikuti jumlah slot unik yang diurutkan naik. `filterBySlots(templates, count | null) -> templates`.
  - `state.js`: `createState()` ditambah `logging: false`. `logSessionOnce(state, send: () => Promise) -> Promise<void>`: tidak melakukan apa-apa bila `state.logged || state.logging`. Bila berhasil, `logged = true`. Bila gagal, `logged` tetap false dan bisa dicoba lagi. `logging` selalu dikembalikan ke false.
  - `strip.js` `render`: `canvas.width`/`height` hanya diisi bila nilainya berbeda. Bila ukurannya sama, kanvas dibersihkan dengan `ctx.setTransform(1, 0, 0, 1, 0, 0)` lalu `clearRect`, sebelum latar diisi.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `result-store`: job A = `begin()`, lalu `invalidate()`, lalu `commit(A, file)` → false, `createURL` tidak dipanggil, dan `current() === null` (Review Focus 3). Untuk job B = `begin()` → `commit(B, file)` → true dan `current().url === 'blob:1'`. `invalidate()` → `revokeURL` dipanggil dengan `'blob:1'`. Bila ada dua job berurutan (`begin()` dua kali), hanya commit job kedua yang diterima.
  - `wake-lock`: dengan `request` yang mengembalikan promise yang diselesaikan manual: `acquire()`, lalu `release()`, lalu promise diselesaikan dengan sentinel palsu → `sentinel.released === true` dan `held() === false`. Bila `request` melempar, `acquire()` tidak melempar. Kalau `acquire()` dua kali berturut-turut, `request` hanya dipanggil sekali.
  - `models`: template dengan jumlah slot `[3, 2, 3, 4]` → `[null, 2, 3, 4]`. `filterBySlots(list, 3)` hanya mengembalikan yang 3 slot, dan `filterBySlots(list, null)` mengembalikan semuanya.
  - `state`: dua panggilan `logSessionOnce` serentak → `send` dipanggil sekali. Setelah `send` gagal, panggilan berikutnya memanggil `send` lagi. `resetPhotos` mengembalikan `logged` dan `logging` ke false.
  - `strip`: `render` dua kali dengan skala sama ke `fakeCanvas()` yang mencatat setiap penulisan `width` (pakai setter) → `width` hanya ditulis sekali, dan panggilan kedua memanggil `clearRect`.
- [ ] **Step 2:** `node --test` untuk kelima file → FAIL.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4:** `npm test` → PASS.

### Task 3.2: Kerangka booth — `booth.html`, `main.js`, Sambutan, Pilih template

**Files:**
- Create: `public/booth.html`, `public/css/booth.css`, `public/js/booth/dom.js`, `public/js/booth/main.js`, `public/js/booth/screens/welcome.js`, `public/js/booth/screens/pick.js`
- Modify: `server.js` (`GET /booth`), `public/js/i18n/id.js`, `public/js/i18n/en.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `t`, `applyI18n`, `bindLangSelect`, `initialLang` (2.2); `initTheme`, `bindThemeToggle` (2.1); `slotCountChips`, `filterBySlots` (3.1); `state.js`, `strip.loadTemplateImage`, `api.getJSON`
- Produces:
  - `dom.js`: `$`, `$$`, `el(tag, props, ...children)` (sama dengan v1), `sleep(ms)`, `nextFrame()`.
  - Kontrak layar: setiap modul `screens/*.js` mengekspor `init(ctx)` (dipanggil sekali, memasang listener), `enter(ctx, params)`, dan `leave(ctx)`.
  - `ctx` (dibuat di `main.js`):
    - `state` (dari `createState()`)
    - `session: { templateImg, target: number | null, selected: number, pickMode: 'start' | 'change' }`
    - `settings` (hasil `GET /api/settings`, dengan cadangan `{ countdown_seconds: 3, mirror_output: 0, kiosk_idle_seconds: 90, review_seconds: 3, sound_default: 1, kiosk_available: false }`)
    - `result` (`createResultStore()`)
    - `wakeLock` (`createWakeLock()`)
    - `go(name, params = {})`
    - `screen() -> name`
    - `visit() -> number` (naik setiap `go`; dipakai untuk membuang hasil async yang sudah basi)
    - `onReset(cb)` dan `onPhotoChanged(cb)`: mendaftarkan hook. Dipakai `adjust.js` untuk membuang salinan 1024 px dan thumbnail filter tanpa `main.js` perlu tahu isinya.
    - `resetSession()` (memanggil `resetAll`, menjalankan semua hook `onReset`, `result.invalidate()`, lalu mengembalikan `session` ke nilai awal)
  - `go`: memanggil `leave` layar lama, menampilkan `<section data-screen="name">` yang sesuai, memperbarui `.steps` (urutan `pick`, `shoot`, `adjust`, `result`; `review` dihitung sebagai `shoot`), menggulir ke atas, lalu memanggil `enter`.
  - `booth.html`: `<html lang="id" data-skin="fun">`. Memuat `theme-boot.js` (klasik), `tokens.css`, `components.css`, `booth.css`, dan `<script type="module" src="/js/booth/main.js">`. Header berisi logo (`#booth-logo`), `.steps`, tombol suara (`#sound-toggle`, disembunyikan sampai Task 4.2), dan menu (`#booth-menu`: tema, bahasa, tautan landing dengan `data-kiosk-hide`). Satu `<section data-screen>` untuk setiap layar: `welcome`, `pick`, `shoot`, `review`, `adjust`, `result`. Kerangka `review` dibiarkan kosong sampai Tahap 4.

- [ ] **Step 1: Tulis tes yang gagal** di `test/server.test.js`: `GET /booth` → 200, `content-type` text/html, dan body memuat `data-screen="shoot"` serta `/js/booth/main.js`.
- [ ] **Step 2:** `node --test test/server.test.js` → FAIL (404).
- [ ] **Step 3: Tambahkan route** `app.get('/booth', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'booth.html')))` sebelum `express.static`.
- [ ] **Step 4: Bangun `main.js`, `welcome.js` (varian non-kiosk: judul, "Mulai", bahasa, tema, banner browser dalam aplikasi dari v1), dan `pick.js`.** `pick.js` membawa perilaku v1 (`openPicker`, `loadTemplates`, `pickTemplate` dengan `latestOnly`, konfirmasi `wouldDrop` dalam mode `change`) ditambah:
  - Chip filter jumlah slot. Chip memakai `aria-pressed`, dan teks chip dari `t('booth.pick.all')` atau `t('booth.pick.nPhotos', { n })`.
  - Indikator "Memuat…" di kartu yang sedang dimuat. Semua kartu `disabled` selama proses itu.
  - Error memuat template → `t('booth.pick.loadError')` (pesan umum, bukan `err.message` dari server, sesuai §6).

  `leave` membatalkan `picking`. Setelah template dimuat, `pick` memanggil `ctx.go('shoot')` bila masih ada slot kosong, atau `ctx.go('adjust')` bila tidak. Tambahkan setiap kunci yang dipakai ke `id.js` dan `en.js`.
- [ ] **Step 5:** `npm test` → PASS (termasuk `i18n-usage` dan `html-csp`).

### Task 3.3: Layar Berpose (perilaku v1) dan galeri

**Files:**
- Create: `public/js/booth/screens/shoot.js`
- Modify: `public/booth.html`, `public/css/booth.css`, `public/js/i18n/id.js`, `public/js/i18n/en.js`

**Interfaces:**
- Consumes: `ctx` (3.2), `camera.js`, `ctx.wakeLock`, `ctx.result`
- Produces: `enter(ctx, { target = null, auto = false })`. `export function setPhoto(ctx, slot, canvas)` menjalankan hook `onPhotoChanged(slot, oldCanvas)`, lalu melepas canvas lama, menyimpan canvas baru, dan memanggil `ctx.result.invalidate()`. Fungsi ini juga dipakai `review.js`.

- [ ] **Step 1: Pindahkan logika booth v1** (`startCamera`, `refreshCameraList`, `recoverCamera`, `visibilitychange`, `pagehide`, `countdown`, `flash`, `runSequence`, galeri `decodeImage`/`addFromGallery`) ke `shoot.js`. Indikator foto berupa deretan kotak (terisi / sedang / belum) dan teks `t('booth.shoot.photoOf', { i, n })` dengan id kamus `"Foto {i} dari {n}"`. Bila `target != null`, teksnya `t('booth.shoot.retakeOf', { i, n })`. Pesan error kamera: `t(cameraErrorMessage(err))`. Tata letak: di atas 900 px dan lanskap (`@media (min-width: 901px) and (orientation: landscape)`), pratinjau di kiri dan kontrol di kanan.
- [ ] **Step 2: Perbaikan §4.4.**
  - Wake lock memakai `ctx.wakeLock.acquire()` di `enter` dan `release()` di `leave`.
  - Selama impor galeri, `#shoot` dan input galeri dikunci (`importing = true`). Setiap hasil dekode dibandingkan dengan `ctx.visit()` yang dicatat saat mulai, dan hasilnya dibuang (canvas dilepas) bila sudah berbeda.
  - `auto: true` langsung memanggil `runSequence()` setelah kamera siap.
- [ ] **Step 3: Verifikasi manual cepat.** Jalankan `npm run dev`, buka `http://localhost:3000/booth` di Chrome, lalu: Mulai → pilih template → ambil semua foto → layar Atur terbuka (layar Atur boleh masih kosong di task ini). Konsol tanpa error.

### Task 3.4: Layar Atur dan Hasil (perilaku v1)

**Files:**
- Create: `public/js/booth/screens/adjust.js`, `public/js/booth/screens/result.js`
- Modify: `public/booth.html`, `public/css/booth.css`, `public/js/i18n/id.js`, `public/js/i18n/en.js`

**Interfaces:**
- Consumes: `ctx`, `setPhoto` (3.3), `logSessionOnce` (3.1), `ctx.result` (3.1)
- Produces: `adjust.js` mengekspor `drawAdjust(ctx)`. `result.js` mengekspor `download(ctx)`.

- [ ] **Step 1: Pindahkan Atur v1** (gestur, roda, slider, −/+, `ensureFiltered`, `drawAdjust`). Cache salinan 1024 px tinggal di `adjust.js`. `init` mendaftarkan `ctx.onPhotoChanged` (buang salinan slot itu) dan `ctx.onReset` (kosongkan semuanya). `enter` memotong cache ke jumlah slot template, menggantikan `trimFilteredCache` v1. Filter sementara masih berupa tombol teks `t('filter.<id>')`, dan baru diganti thumbnail di Task 4.3. Garis slot terpilih memakai warna `--accent` yang dibaca lewat `getComputedStyle(document.documentElement).getPropertyValue('--accent')` setiap kali menggambar. Panel di kanan kanvas, dan turun ke bawah di bawah 800 px. "Ulang foto ini" → `go('shoot', { target: selected })`. "Ganti bingkai" → `go('pick', { mode: 'change' })`.
- [ ] **Step 2: Pindahkan Hasil v1**, dengan perubahan berikut:
  - `prepareResult` memakai `const job = ctx.result.begin()` dan `ctx.result.commit(job, file)`.
  - `adjust.enter` dan setiap perubahan transform atau filter memanggil `ctx.result.invalidate()`.
  - Unduh memakai `logSessionOnce(ctx.state, () => sendJSON('POST', '/api/sessions', { template_id }))`.
  - Lembar share hanya dipakai bila `matchMedia('(pointer: coarse)').matches` (Keputusan §4.4).
  - Tombol Atur lagi, Ulang sesi, dan Sesi baru. Sesi baru memanggil `ctx.resetSession()` lalu `go('pick', { mode: 'start' })`. Perilaku kiosk ditambahkan di Tahap 5.
  - Overlay simpan iOS lama dari v1 tetap ada, dengan teks dari kamus.
- [ ] **Step 3:** `npm test` → PASS.

### Task 3.5: Landing page, hapus `app.js`, uji ulang alur v1

**Files:**
- Create: `public/js/landing.js`, `public/css/landing.css`
- Modify: `public/index.html` (ditulis ulang), `public/js/i18n/id.js`, `public/js/i18n/en.js`, `README.md`
- Delete: `public/js/app.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: i18n, tema, `PRODUCT_NAME`, `getJSON('/api/templates')`
- Produces: `index.html` (`data-skin="fun"`, `data-page="landing"`) dengan bagian §3.1: `#nav`, `#hero`, `#how` (empat langkah), `#templates` (`hidden` sampai ada data), `#cta`, dan footer. Tidak memuat `booth.css`.

- [ ] **Step 1: Tulis tes yang gagal** di `test/server.test.js`: `GET /` → 200 HTML yang memuat `data-page="landing"` dan `href="/booth"`, dan tidak memuat `/js/app.js`.
- [ ] **Step 2:** `node --test test/server.test.js` → FAIL.
- [ ] **Step 3: Bangun landing.** Judul hero memakai kunci `landing.hero.title1` = `"Abadikan"` dan `landing.hero.title2` = `"Momen Seru!"` (`.display`, kata kedua berwarna `--accent`). Kolase tiga photostrip miring dan bintang dibuat dengan CSS saja. `landing.js` mengambil sampai 5 template dan menampilkan `thumb_url` + nama. Bila hasilnya kosong atau permintaan gagal, `#templates` tetap tersembunyi, begitu pula tautan "Template" di navigasi. Footer: `PRODUCT_NAME`, tahun berjalan, dan tautan "Masuk petugas" ke `/admin`. Tidak ada angka statistik maupun testimoni.
- [ ] **Step 4: Hapus `public/js/app.js`.** Perbarui README: booth sekarang di `/booth`, landing di `/`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Uji browser alur v1 di struktur baru.** Chrome headless + kamera palsu, `npm run seed:sample` lebih dulu. Uji di 390×844 dan 1440×900: landing → Mulai Foto → `/booth` → Mulai → pilih template → foto semua slot → Atur (geser, slider, filter Hitam putih) → Hasil → Unduh (file `photobooth-*.jpg` tersimpan dan satu baris `session_logs` bertambah walau Unduh diketuk dua kali dengan cepat). Kasus lain: Batal saat hitung mundur; Ganti template 3→2 slot dengan konfirmasi; Ulang foto ini; galeri JPEG dan file rusak. Konsol tanpa error/CSP. Catat hasilnya untuk laporan tahap.
- [ ] **Step 7: Commit Tahap 3**

```bash
git add -A public/ server.js README.md test/
git commit -m "feat: modular booth screens, landing page, v1 deferred fixes"
```

---

# TAHAP 4 — Fitur booth baru

### Task 4.1: Bingkai di kamera (`overlay.js`)

**Files:**
- Create: `public/js/booth/overlay.js`
- Modify: `public/js/booth/screens/shoot.js`, `public/booth.html`, `public/css/booth.css`
- Test: `test/overlay.test.js`

**Interfaces:**
- Produces:
  - `overlayLayout(template, slotIndex, { margin = 0.18 } = {}) -> { region: { x, y, w, h }, slot: { left, top, width, height }, image: { left, top, width, height } }`. `slot` dan `image` dalam persen terhadap `region`. `image.width = canvas_w / region.w × 100`, `image.left = −region.x / region.w × 100`, dan sejenisnya untuk sumbu y.
  - `applyOverlay(container, layout, template)` (DOM, di file yang sama tetapi tidak dipanggil saat modul dimuat) mengatur `aspect-ratio: region.w / region.h` di wadah, posisi `.overlay-hole` (tempat `<video>`), dan posisi `<img class="overlay-frame">`. Latar wadah = `template.bg_color`.

- [ ] **Step 1: Tulis tes yang gagal** `test/overlay.test.js`. Bandingkan angka dengan toleransi `1e-6`.
  - Slot di tengah: kanvas 1000×1000, slot `{ x: 400, y: 400, w: 200, h: 100 }` → region `{ x: 364, y: 364, w: 272, h: 172 }`, slot `{ left: 13.235294, top: 20.930233, width: 73.529412, height: 58.139535 }`, image `{ left: -133.823529, top: -211.627907, width: 367.647059, height: 581.395349 }`.
  - Terpotong di tepi: `TEST_TEMPLATE` dari helpers (300×400, slot 0) → region `{ x: 0, y: 0, w: 300, h: 241 }`, `slot.left = 3.333333`, `slot.top = 4.149378`.
  - Pojok kanan bawah: kanvas 1000×1000, slot `{ x: 800, y: 900, w: 200, h: 100 }` → region `{ x: 764, y: 864, w: 236, h: 136 }`, `slot.left = 15.254237`, `slot.top = 26.470588`.
  - Slot seluas kanvas `{ x: 0, y: 0, w: 300, h: 400 }` → region = kanvas, slot `{ left: 0, top: 0, width: 100, height: 100 }`, dan semua angka finite (Review Focus 4).
  - `margin: 0` → region sama dengan slot.
- [ ] **Step 2:** `node --test test/overlay.test.js` → FAIL.
- [ ] **Step 3: Implementasikan `overlayLayout`** sesuai Keputusan 10.
- [ ] **Step 4: Pasang di `shoot.js`.** Struktur `#viewfinder` berisi `.overlay-hole > video` dan `img.overlay-frame` (src = `template.image_url`), dengan `overflow: hidden`. Video memakai `object-fit: cover`, dan class `mirror` hanya dipasang di video. `updateBoothView` memanggil `applyOverlay` untuk slot aktif. Angka hitung mundur besar ber-outline (`.display`) di tengah.
- [ ] **Step 5:** `npm test` → PASS. Lalu cek di browser: bingkai template terlihat di sekitar video untuk slot 1, 2, dan 3, di 390×844 dan 1440×900.

### Task 4.2: Layar Tinjau dan suara

**Files:**
- Create: `public/js/booth/review-timer.js`, `public/js/booth/screens/review.js`, `public/js/sound.js`
- Modify: `public/js/booth/screens/shoot.js`, `public/js/booth/screens/welcome.js` (membuka audio), `public/js/booth/main.js`, `public/booth.html`, `public/css/booth.css`, kamus
- Test: `test/review-timer.test.js`, `test/sound.test.js`

**Interfaces:**
- Consumes: `overlayLayout`/`applyOverlay` (4.1), `setPhoto` (3.3), `read`/`write`/`KEYS` (2.1)
- Produces:
  - `shouldReview(reviewSeconds: number, source: 'camera' | 'gallery') -> boolean`
  - `createReviewTimer({ durationMs, now = () => performance.now() }) -> { tick() -> 'running' | 'expired' | 'cancelled', fraction() -> number (1 → 0), cancel() }`
  - `review.js`: `enter(ctx, { slot, target })` dan `leave` membatalkan timer. Tombol "Ulang" → `go('shoot', { target: slot, auto: true })`. Tombol "Lanjut" atau waktu habis → `go('adjust')` bila `target != null` atau tidak ada slot kosong; selain itu `go('shoot', { auto: true })`.
  - `sound.js`:
    - `TICK_HZ = 880`, `LAST_HZ = 1320`, `BEEP_MS = 80`
    - `soundEnabled({ stored, settingDefault }) -> boolean` (`'1'`/`'0'` yang tersimpan menang; selain itu `settingDefault === 1`)
    - `unlock()` (membuat atau melanjutkan `AudioContext`, aman dipanggil berkali-kali, diam saja bila tidak didukung)
    - `beep(last = false)`
    - `shutter()` (derau putih ±120 ms dengan envelope turun eksponensial)
    - `setEnabled(on, { persist = true })`
    - `isEnabled()`
    - `initSound(settings)`

    Semua fungsi suara diam saja bila dimatikan atau sebelum `unlock()`.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `review-timer`: dengan jam palsu `t`, `durationMs: 3000`. `t = 0` → `'running'` dan `fraction() === 1`. `t = 1500` → `fraction() === 0.5`. `t = 3000` → `'expired'`. Setelah `cancel()` → `'cancelled'` walau `t = 5000`. `shouldReview(0, 'camera') === false`, `shouldReview(3, 'gallery') === false`, `shouldReview(3, 'camera') === true`.
  - `sound`: `soundEnabled({ stored: '0', settingDefault: 1 }) === false`, `({ stored: null, settingDefault: 1 }) === true`, `({ stored: 'x', settingDefault: 0 }) === false`. Modul bisa diimpor di Node tanpa `AudioContext`, dan `beep()` di Node tidak melempar.
- [ ] **Step 2:** `node --test test/review-timer.test.js test/sound.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Di `shoot.runSequence`: `beep(s === 1)` setiap detik hitung mundur, dan `shutter()` bersama `flash()`. Setelah jepretan kamera, bila `shouldReview(ctx.settings.review_seconds, 'camera')` → hentikan urutan lalu `go('review', { slot, target })`. Galeri tidak pernah ke `review`. `review.js` menampilkan foto lewat Keputusan 12 di dalam bingkai overlay yang sama, dengan `.progress-bar` yang mengecil (`transform: scaleX(fraction)`, digerakkan `requestAnimationFrame`). `#sound-toggle` (ikon speaker, `aria-pressed`) ditampilkan di luar kiosk. Ketukan pertama di `welcome` memanggil `unlock()`.
- [ ] **Step 4:** `npm test` → PASS. Lalu cek di browser: sesi 3 foto dengan `review_seconds = 3` (tinjau muncul tiap jepretan, Ulang mengambil ulang slot yang sama, waktu habis lanjut sendiri), dan dengan `review_seconds = 0` (tidak ada tinjau).

### Task 4.3: Thumbnail filter di layar Atur

**Files:**
- Create: `public/js/booth/filter-thumbs.js`
- Modify: `public/js/booth/screens/adjust.js`, `public/css/booth.css`
- Test: `test/filter-thumbs.test.js`

**Interfaces:**
- Consumes: `filteredCanvas`, `FILTERS` (v1), `releaseCanvas` (v1)
- Produces: `createFilterThumbs({ make = (photo, id) => filteredCanvas(photo, id, 96), release = releaseCanvas } = {}) -> { get(photo, filterId) -> canvas, drop(photo), clear() }`. Cache berupa `Map<photo, Map<filterId, canvas>>`.

- [ ] **Step 1: Tulis tes yang gagal.** `get(p, 'bw')` dua kali → `make` dipanggil sekali. `get(p, 'sepia')` → `make` dipanggil lagi. `drop(p)` → `release` dipanggil untuk kedua canvas, dan `get(p, 'bw')` berikutnya membuat ulang. `clear()` melepas semuanya.
- [ ] **Step 2:** `node --test test/filter-thumbs.test.js` → FAIL.
- [ ] **Step 3: Implementasikan dan pasang.** `#filters` berisi satu tombol per filter (`role="radio"`, `aria-checked`), masing-masing berisi canvas thumbnail foto slot terpilih dan label `t('filter.<id>')`. Daftar ini dibangun ulang saat slot terpilih atau filter berubah. Bila slot terpilih belum punya foto, label ditampilkan tanpa thumbnail. `setPhoto` dan `ctx.resetSession` memanggil `drop`/`clear`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit Tahap 4**

```bash
git add -A public/ test/
git commit -m "feat: frame-in-camera, review screen, sounds, filter thumbnails"
```

---

# TAHAP 5 — Mode kiosk

### Task 5.1: `idle.js`

**Files:**
- Create: `public/js/idle.js`
- Test: `test/idle.test.js`

**Interfaces:**
- Produces:
  - `createIdleTimer({ timeoutMs, warnMs, now = () => Date.now() }) -> { activity(), pause(), resume(), tick() -> 'idle' | 'warn' | 'expired', paused() -> boolean }`. `'warn'` dimulai pada `timeoutMs − warnMs`. Setelah `'expired'`, status bertahan sampai `activity()`. Jeda bertingkat sesuai Keputusan 9: selama dijeda, `tick()` → `'idle'`.
  - `attachIdle(timer, { target = document, intervalMs = 250, onWarn, onExpire, onActive }) -> detach()`. Mendengarkan `pointerdown`, `keydown`, dan `wheel` (`capture: true, passive: true`). Callback hanya dipanggil saat status berubah. `onActive` dipanggil ketika status kembali dari `'warn'` ke `'idle'`.

- [ ] **Step 1: Tulis tes yang gagal** dengan jam palsu, `timeoutMs: 90_000`, `warnMs: 10_000`:
  - `t = 79_999` → `'idle'`; `80_000` → `'warn'`; `90_000` → `'expired'`; `120_000` → tetap `'expired'`.
  - Di `t = 85_000`, `activity()` → `'idle'`; `t = 165_000` → `'warn'`.
  - `pause()` di `t = 10_000`, lalu `t = 200_000` → `'idle'`. `resume()` di `t = 200_000`, lalu `t = 289_999` → `'idle'` dan `290_000` → `'expired'`.
  - `pause()` dua kali lalu `resume()` sekali → `paused() === true` dan `tick()` di jam berapa pun → `'idle'`. `resume()` kedua → jam mulai dari nol. `resume()` berlebih tidak membuat hitungan negatif.
- [ ] **Step 2:** `node --test test/idle.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4:** `node --test test/idle.test.js` → PASS.

### Task 5.2: `kiosk.js` — status, pintu petugas, PIN, menu petugas

**Files:**
- Create: `public/js/kiosk.js`
- Modify: `public/booth.html` (dialog PIN, menu petugas, area pojok 64×64), `public/css/booth.css`, kamus
- Test: `test/kiosk-client.test.js`

**Interfaces:**
- Consumes: `read`/`write`/`KEYS`, `sendJSON`, `ApiError`, `t`, `setLang`, `bindThemeToggle`, `setEnabled`/`isEnabled` dari sound
- Produces:
  - `isKioskOn(store?) -> boolean` (`read(KEYS.kiosk) === '1'`), `setKioskOn(on, store?)`
  - `deviceLang(store?) -> 'id' | 'en' | null`, `setDeviceLang(lang | null, store?)`
  - `pinErrorKey(err) -> { key, params }`:
    - `ApiError` 401 → `{ key: 'kiosk.pin.wrong' }`
    - 429 → `{ key: 'kiosk.pin.limited', params: { m: ceil(retryAfter / 60) || 15 } }`
    - status 0 → `{ key: 'kiosk.pin.offline' }`, dengan teks id `"Tidak bisa memeriksa PIN. Periksa koneksi."`
    - selain itu → `{ key: 'kiosk.pin.error' }`
  - `bindLongPress(el, { ms = 3000, onProgress(fraction), onDone })` memakai `pointerdown`, `pointerup`, `pointercancel`, dan `pointerleave`, plus `requestAnimationFrame`.
  - `initKiosk(ctx, { onChange(on) })` memasang pintu petugas di `#booth-logo` dan `#kiosk-corner`. Bila `ctx.settings.kiosk_available === false`, pintu menampilkan toast `t('kiosk.needPin')` dengan teks id `"Mode kiosk butuh PIN. Atur PIN di halaman Pengaturan admin."`. Bila tidak, pintu membuka `<dialog id="pin-dialog">` dengan papan angka 0–9, hapus, dan OK (tombol ≥ 56 px, input `inputmode="numeric"` dan `autocomplete="off"`). PIN benar membuka `<dialog id="staff-menu">` berisi Aktifkan/Nonaktifkan kiosk, Layar penuh, Suara, Bahasa default perangkat (Indonesia / English / ikuti browser), Tema, dan Muat ulang.

- [ ] **Step 1: Tulis tes yang gagal.** `pinErrorKey(new ApiError(429, 'x', 120))` → `{ key: 'kiosk.pin.limited', params: { m: 2 } }`. Dengan `retryAfter` null → `m: 15`. Status 0 → offline, 401 → wrong, `new Error()` → error. `isKioskOn` dengan store yang melempar → false. `setKioskOn(true, store)` lalu `isKioskOn(store) === true`. Semua kunci yang dikembalikan `pinErrorKey` ada di `id.js`.
- [ ] **Step 2:** `node --test test/kiosk-client.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Selama tekan lama berlangsung, cincin progres tipis (SVG `stroke-dashoffset`) tampil di dekat titik tekan. Kiosk yang tidak aktif juga bisa dibuka dari logo (cara mengaktifkan). Area pojok hanya aktif saat kiosk menyala.
- [ ] **Step 4:** `npm test` → PASS.

### Task 5.3: Perilaku kiosk di booth dan README

**Files:**
- Modify: `public/js/booth/main.js`, `public/js/booth/screens/welcome.js`, `public/js/booth/screens/shoot.js`, `public/js/booth/screens/review.js`, `public/js/booth/screens/result.js`, `public/css/booth.css`, kamus, `README.md`

**Interfaces:**
- Consumes: `createIdleTimer`, `attachIdle` (5.1), `initKiosk`, `isKioskOn`, `deviceLang` (5.2), `ctx.wakeLock`
- Produces: `ctx.kiosk() -> boolean`, `ctx.idle` (timer dari 5.1), dan `applyKioskLock(on)` di `main.js`.

- [ ] **Step 1: Kunci layar.** `applyKioskLock(on)`:
  - Memasang `body.kiosk`, yang menyembunyikan `[data-kiosk-hide]` (tautan landing, tombol keluar, tombol layar penuh, tombol suara) dan membuat `user-select: none`.
  - Mencegah `contextmenu` di dalam `#booth`.
  - Memegang `ctx.wakeLock` di semua layar, termasuk sambutan.
  - Menampilkan area `#kiosk-corner`.

  Saat sesi dimulai dari sambutan dalam kiosk: `document.documentElement.requestFullscreen?.().catch(() => {})`.
- [ ] **Step 2: Sambutan kiosk.** Layar penuh dengan judul besar, slideshow thumbnail template aktif (berganti setiap 4000 ms, berhenti bila `prefers-reduced-motion`; diambil dari `GET /api/templates`, dan disembunyikan bila kosong atau gagal), tombol besar `t('booth.welcome.tapToStart')`, dan keterangan suara serta bahasa. `pointerdown` di mana saja pada layar memanggil `unlock()` lalu `go('pick', { mode: 'start' })`. Setiap kali `welcome.enter` berjalan dalam kiosk, booth memanggil `setLang(deviceLang() ?? initialLang({ navigatorLang: navigator.language }), { persist: false })`.
- [ ] **Step 3: Reset otomatis.** Di `main.js`:
  - `ctx.idle = createIdleTimer({ timeoutMs: settings.kiosk_idle_seconds * 1000, warnMs: 10_000 })`.
  - `attachIdle` hanya saat kiosk aktif. Masuk ke `welcome` → `idle.pause()`, keluar dari `welcome` → `idle.resume()`.
  - `shoot.runSequence` membungkus hitung mundur dan pengambilan foto dengan `pause()`/`resume()` (pakai `try/finally`). `review.enter`/`leave` melakukan hal yang sama.
  - `onWarn` → toast `t('kiosk.idle.warn', { s: 10 })` (id: `"Masih di sana? Kembali ke awal dalam {s} dtk"`) dengan tombol `t('kiosk.idle.continue')` yang memanggil `idle.activity()`. `onActive` menutup toast.
  - `onExpire` → tutup semua `<dialog open>` dan overlay simpan, `ctx.resetSession()` (termasuk `result.invalidate()`), lalu `go('welcome')`. Kamera tidak dimatikan.
- [ ] **Step 4: Hasil di kiosk.** "Sesi baru" → `ctx.resetSession()` lalu `go('welcome')`.
- [ ] **Step 5: README.** Tambahkan bagian "Mode kiosk": cara mengatur PIN di admin, tekan lama logo 3 detik, Akses Terpandu iOS (Pengaturan › Aksesibilitas › Akses Terpandu, lalu tekan tombol samping tiga kali), dan cara darurat keluar kiosk saat server tidak bisa dihubungi (tutup tab, atau hapus data situs untuk alamat booth).
- [ ] **Step 6:** `npm test` → PASS. Lalu cek di browser dengan `kiosk_idle_seconds = 30`: aktifkan kiosk lewat PIN → mulai sesi, ambil 1 foto → diam 20 dtk → toast muncul → "Lanjutkan" menutup toast → diam 30 dtk → kembali ke sambutan, dan sesi baru mulai dari pilih template tanpa foto lama. Toast tidak muncul selama hitung mundur atau tinjau.
- [ ] **Step 7: Commit Tahap 5**

```bash
git add -A public/ README.md test/
git commit -m "feat: kiosk mode with PIN gate, idle reset, lockdown"
```

---

# TAHAP 6 — Admin

### Task 6.1: Kerangka admin, pemecahan halaman, login

**Files:**
- Create: `public/admin/common.js`, `public/admin/pages/login.js`, `public/admin/pages/edit.js`, `public/css/admin.css`, `public/admin/templates.html`, `public/admin/settings.html`
- Modify: `public/admin/admin.js` (menjadi titik masuk + `renderShell`), `public/admin/login.html`, `public/admin/dashboard.html`, `public/admin/template-edit.html`
- Test: `test/admin-pages.test.js`

**Interfaces:**
- Produces:
  - `common.js`: `$`, `el`, `setStatus`, `adminApi` (isinya dipindah dari `admin.js` tanpa perubahan), dan `svg(tag, attrs, ...children)` (`createElementNS`).
  - `admin.js`: `renderShell(active: 'dashboard' | 'templates' | 'settings' | null)` membangun `<aside class="shell">` (logo + `PRODUCT_NAME`, tautan Dashboard / Template / Pengaturan dengan `aria-current="page"` untuk yang aktif, "Buka booth ↗" ke `/booth` dengan `target="_blank"`, tombol tema, dan Keluar). Di bawah 768 px, sidebar menjadi bilah atas dengan tombol menu `aria-expanded`. Halaman dipilih dari `document.body.dataset.page` lewat peta `{ login, dashboard, templates, edit, settings }`, yang memanggil `import('./pages/<nama>.js')` lalu `init()`. Halaman `login` tanpa shell. `edit` memakai shell dengan `active = 'templates'`.
  - `makeThumbnail` pindah ke `pages/edit.js` dan tetap diekspor.
  - Semua HTML admin memakai `<html data-skin="clean">`, `theme-boot.js`, `tokens.css`, `components.css`, dan `admin.css`, dengan `<main id="content">` sebagai tempat isi halaman.

- [ ] **Step 1: Tulis tes yang gagal** `test/admin-pages.test.js`. Untuk setiap file `login`, `dashboard`, `templates`, `template-edit`, `settings` di `public/admin/`: file ada, memuat `data-skin="clean"`, memuat `/admin/admin.js`, dan tidak memuat `/css/app.css`. Lewat supertest, `GET /admin/templates.html` dan `/admin/settings.html` → 200.
- [ ] **Step 2:** `node --test test/admin-pages.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Pindahkan editor template v1 ke `pages/edit.js` tanpa mengubah perilakunya. Tata letak baru: pratinjau `position: sticky` di kanan pada layar ≥ 1024 px. Tautan "Buka booth" yang lama (`/`) menjadi `/booth`.
- [ ] **Step 4:** `npm test` → PASS.

### Task 6.2: Dashboard dan grafik 14 hari

**Files:**
- Create: `public/admin/chart.js`, `public/admin/pages/dashboard.js`
- Modify: `public/admin/dashboard.html`
- Test: `test/chart.test.js`

**Interfaces:**
- Consumes: `GET /api/admin/stats` (Task 1.4), `svg()` (6.1)
- Produces:
  - `barChartModel(daily, { width, height, gap = 4, minBar = 2 }) -> { max, bars: [{ x, y, w, h, date, count, today }] }`. `today` = elemen terakhir. Batang dengan `count = 0` setinggi `minBar`. Bila `max = 0`, semua batang setinggi `minBar` (tanpa pembagian nol).
  - `renderBarChart(container, daily)` membangun `<svg role="img" aria-label="Sesi 14 hari terakhir">`. Setiap `<rect>` punya `<title>` berisi `"<tanggal dd MMM>: <n> sesi"`, dan batang hari ini memakai class `today` (warna `--primary`).

- [ ] **Step 1: Tulis tes yang gagal.** 14 hari dengan `count = [0, …, 0, 5, 10]`, `width: 280`, `height: 100`, `gap: 4` → `bars.length === 14`, `w === (280 − 13 × 4) / 14`, batang terakhir `h === 100` dan `today === true`, batang ke-13 `h === 50`, batang pertama `h === 2`, dan setiap `y + h === 100`. Semua nol → setiap `h === 2` dan `max === 0`.
- [ ] **Step 2:** `node --test test/chart.test.js` → FAIL.
- [ ] **Step 3: Implementasikan dan bangun dashboard:** kartu Sesi hari ini (`sessions_today`), Sesi 7 hari (`sessions_7d`), Template aktif, Terpopuler (nama urutan pertama, atau "–"); grafik; dan daftar 5 terpopuler.
- [ ] **Step 4:** `npm test` → PASS.

### Task 6.3: Halaman Template

**Files:**
- Create: `public/admin/pages/templates.js`, `public/admin/templates-filter.js`
- Modify: `public/admin/templates.html`
- Test: `test/templates-filter.test.js`

**Interfaces:**
- Produces: `filterTemplates(list, { query = '', status = 'all' }) -> list`. Pencocokan nama tidak peka huruf besar/kecil dan memangkas spasi di `query`. `status` bernilai `'all' | 'active' | 'inactive' | 'archived'`.

- [ ] **Step 1: Tulis tes yang gagal.** Dengan nama `['Ulang Tahun', 'Pernikahan', 'ulang lagi']`: query `'  ULANG '` → 2 hasil. Dengan `status: 'archived'` → hanya yang berstatus arsip. Query kosong dan `'all'` → semua, urutan tidak berubah.
- [ ] **Step 2:** `node --test test/templates-filter.test.js` → FAIL.
- [ ] **Step 3: Implementasikan.** Pindahkan tabel dan aksi template dari dashboard v1 (`renderTemplates`, `button`) ke `pages/templates.js`, ditambah input cari (`type="search"`), `<select>` status, dan tombol "+ Template baru". Pesan kosong dibedakan antara "Belum ada template" dan "Tidak ada yang cocok".
- [ ] **Step 4:** `npm test` → PASS.

### Task 6.4: Halaman Pengaturan dan PIN, hapus `app.css`

**Files:**
- Create: `public/admin/pages/settings.js`
- Modify: `public/admin/settings.html`
- Delete: `public/css/app.css`

**Interfaces:**
- Consumes: `GET /api/settings`, `PUT /api/admin/settings` (1.3), `PUT /api/admin/kiosk-pin` (1.2)

- [ ] **Step 1: Bangun formulir.**
  - Kelompok **Booth**: hitung mundur (1–10), cermin hasil, dan waktu tinjau (0–10, "0 = tanpa tinjau").
  - Kelompok **Kiosk**: batas menganggur (30–600 detik), suara default (saklar), dan PIN.
  - Bagian PIN menampilkan status "PIN sudah diatur" atau "PIN belum diatur" dari `kiosk_available`, input `type="password" inputmode="numeric" pattern="\d{4,8}" autocomplete="new-password"`, tombol Simpan PIN, dan tombol Hapus PIN dengan konfirmasi. Setelah berhasil, input dikosongkan dan status dimuat ulang.
  - Pesan 422 dari server ditampilkan apa adanya.
- [ ] **Step 2: Hapus `public/css/app.css`** dan pastikan `grep -r "app.css" public` kosong.
- [ ] **Step 3:** `npm test` → PASS. Lalu cek di browser: login → setiap halaman admin terbuka di terang dan gelap, di 390×844 dan 1440×900; simpan pengaturan; atur, ganti, dan hapus PIN; grafik tampil dengan tooltip `<title>`.
- [ ] **Step 4: Commit Tahap 6**

```bash
git add -A public/ test/
git commit -m "feat: admin redesign with sidebar, charts, templates and settings pages"
```

---

# TAHAP 7 — Verifikasi akhir

### Task 7.1: Uji browser lengkap dan dokumentasi

**Files:**
- Modify: `docs/manual-test.md`, `README.md`

- [ ] **Step 1:** `npm test` → semua lulus. Catat jumlah tes (189 tes v1 + tes baru).
- [ ] **Step 2: Uji browser (§9)** dengan Chrome headless + kamera palsu, `npm run seed:sample`, dan PIN `1234`:
  1. Landing → booth → sesi penuh dengan tinjau → unduh, dalam bahasa Indonesia, lalu ulangi dalam English (ganti bahasa di landing; pilihan terbawa ke booth).
  2. Kiosk: aktifkan lewat PIN → menganggur → peringatan → kembali ke sambutan dengan state kosong → keluar dengan PIN → PIN salah 6 kali → pesan rate limit.
  3. Tema terang dan gelap di landing, booth, dan admin.
  4. Screenshot setiap layar di 390×844, 820×1180, dan 1440×900. Pastikan `document.documentElement.scrollWidth <= innerWidth` di setiap layar, dan tidak ada error konsol atau CSP.
  5. `localStorage` diblokir (Chrome `--disable-local-storage` atau override `Storage.prototype.getItem` yang melempar): booth tetap bisa menyelesaikan satu sesi (Review Focus 2).
- [ ] **Step 3: `docs/manual-test.md`.** Tambahkan baris 21 dan seterusnya:
  - kiosk dengan Akses Terpandu di iPad
  - layar penuh kiosk di Chrome Android
  - suara di iOS setelah ketukan pertama
  - bingkai di kamera pas di setiap perangkat
  - tema gelap di ruangan redup
  - tekan lama logo membuka PIN di layar sentuh dan dengan mouse
  - reset menganggur saat lembar share terbuka di ponsel

  Isi kolom "otomatis" untuk kasus yang sudah lolos di Step 2. Perbarui baris 1 menjadi landing → booth.
- [ ] **Step 4: Commit Tahap 7**

```bash
git add docs/manual-test.md README.md
git commit -m "docs: sub-project A test checklist and kiosk notes"
```

- [ ] **Step 5:** Lanjut ke `superpowers:finishing-a-development-branch`.
