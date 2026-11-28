# Photovoks

Photobooth web app berbasis **event**. Operator membuka booth di iPad / laptop dengan **kode event + PIN**, tamu memilih frame, berfoto (dengan countdown, live photo, filter), lalu mencetak dan scan QR untuk softfile, GIF bergerak, dan versi **AI** (via OpenRouter). Semua sesi masuk ke **galeri event**, cetakan masuk ke **print station**.

```
iPad / laptop booth ──► /booth/KODE ─┐                       ┌─► OpenRouter (Gaya AI)
                                     ├─► Next.js (Vercel) ───┤
HP tamu (scan QR) ───► /s/TOKEN ─────┘         │             └─► Supabase (Postgres + Storage)
                                               ▼
PC + printer ──► /event/KODE/print  (atau `pnpm print`, worker senyap)
```

---

## 1. Ringkasan fitur

| Area | Yang bisa dilakukan |
|---|---|
| **Event** | Banyak event aktif sekaligus. Tiap event punya kode unik, PIN (bcrypt, lockout 5×), frame, pengaturan booth/cetak/AI/galeri sendiri. |
| **Booth** | Layar awal (bawaan atau **video/gambar sendiri**, ketuk layar untuk mulai) → pilih frame → kamera (preview dipotong persis ke rasio slot) → countdown → **jeda tiap foto: tamu menekan tombol lagi untuk foto berikutnya** → pilih foto terbaik + ulang foto + filter (17 preset termasuk Sinematik, Kodachrome, Digicam Y2K, Polaroid, Lomo, Pink Kalcer) + **Atur foto** (kecerahan, kontras, bagian terang/gelap, saturasi, vibrance, suhu, tint, pudar, grain, vignet, ketajaman) + **Gaya meme** (10 template, aktifkan di Pengaturan → Fun; saat meme aktif, foto dinaikkan di atas dekorasi frame supaya teks meme tidak tertutup) → komposisi (dengan **QR softfile di frame**) → QR, **cetak satu ketukan**, Gaya AI. Auto-kembali ke awal saat idle. |
| **Tema "Photovoks 98"** | Alur tamu (booth, halaman QR, live wall, landing) bergaya desktop Windows 98 mengikuti design system 98.css / Win98 UI kit (wajah silver, bevel 4 warna, title bar navy→biru, seleksi navy, tab, group box, radio, trackbar, scrollbar 98 — kelas `win-*` & utilitas `bevel-*` di `globals.css`), wallpaper bukit hijau + langit berawan dengan garis CRT (gambar asli prosedural, bukan foto berhak cipta). Kamera tampil di dalam TV CRT merah. Pemilih frame bergaya menu konsol (XMB). Komponen ada di `components/os/`. |
| **Pilih karakter** | 4 pemandu 3D orisinal (three.js, dimuat terpisah): Si Bokek, Si Kaget, Si Ngantuk, Si Licik. Tamu memilih di awal, lalu karakter menemani di pojok layar dengan tips per langkah dan ikut bereaksi saat hitung mundur dan flash. Karakter terbawa ke halaman QR (`?b=`). Efek suara sintetis bisa dimatikan di pengaturan operator. |
| **Lokasi** | Tetap di **Universitas Indonesia, Depok** (`lib/location.ts`, tidak bisa diubah per event). Kartu pos + peta OpenStreetMap interaktif di landing dan halaman tamu, tombol Buka peta / Rute. CSP mengizinkan `frame-src https://www.openstreetmap.org`. |
| **Pengaturan Booth** | **Satu halaman** per event (`/event/KODE/booth`): layar awal + pratinjau, frame & letak QR, sesi foto, cetak, fitur tamu, galeri/live/buku tamu, status. Satu tombol Simpan. |
| **Tamu (HP)** | Scan QR → unduh foto/GIF, **hias dengan stiker** (stiker bawaan, emoji, teks, stiker PNG dari penyelenggara) lalu simpan atau **kirim ke printer penyelenggara**, Gaya AI termasuk **prompt sendiri**, link ke buku tamu. |
| **Galeri live** | `/live/TOKEN` — layar penuh untuk proyektor/TV; foto & GIF baru muncul ±5 detik setelah sesi selesai, pesan buku tamu berjalan di bawah. |
| **Buku tamu** | Microsite `/m/TOKEN` — tamu menulis pesan & kesan + foto. Moderasi (sembunyikan/hapus) di portal event › Buku Tamu. |
| **Live photo / GIF** | Setiap jepretan merekam burst ±1 detik (10 frame). Hasil: GIF *seluruh frame* yang bergerak + sprite per-foto dengan kontrol kecepatan. Semua dari foto sesi yang tersimpan. |
| **Galeri** | Galeri event (pengelola), galeri bersama via link (`/g/…`), galeri publik global (`/gallery`, hanya event yang memilih *Publik*). Sembunyikan / hapus sesi. Lazy-load + thumbnail. |
| **Frame Builder** | Editor visual: slot foto, teks (7 font, token `{event}` `{date}` `{time}` `{code}`), **QR sesi** (contoh QR di editor → diganti link softfile tamu saat foto, peringatan bila menutupi slot), gambar/overlay PNG, kotak, lingkaran, garis, barcode. Drag, resize 8 arah, snapping + guide, undo/redo, layer, tata letak slot otomatis, template, pratinjau dengan foto contoh. Library frame dipakai ulang lintas event. |
| **Cetak** | Dialog cetak dengan pratinjau persis (4R, strip 2×6, 5×7, postcard, A4–A6, struk 58/80mm), tata letak (otomatis / pas / penuh / 2 per lembar / isi lembar), margin, jumlah salinan. Mode per event: *print station*, *langsung dari booth*, atau *tanpa cetak*. |
| **Print station** | Antrean real-time per event, cetak dari browser (opsional otomatis), tandai tercetak/gagal, cetak ulang, batas cetak tamu. Atau worker Node senyap (`pnpm print`). |
| **AI** | 8 gaya bawaan + "Gaya Event" (prompt kustom berversi) + opsional **prompt tulisan tamu** (dibungkus aturan keamanan & identitas). Provider modular: OpenRouter (default) atau Gemini langsung. Bandingkan asli vs AI, unduh, cetak, retry, batas per sesi & per hari. |

## 2. Teknologi

- **Next.js 16** (App Router, route handlers, `proxy.ts`), **React 19**, **TypeScript**, **Tailwind CSS 4**
- **Supabase**: Postgres (RLS terkunci, semua akses lewat server dengan service-role) + Storage privat (signed URL)
- **Canvas 2D** satu renderer untuk editor, booth, thumbnail dan file cetak → hasil identik
- `gifenc` (GIF di browser), `sharp` (olah gambar AI di server), `qrcode.react`, `jose` (cookie sesi bertanda tangan), `bcryptjs`
- **Vitest** untuk unit test

Struktur penting:

```
apps/web/
  app/booth/[code]        booth kiosk          app/event/[code]/*   portal event (PIN)
  app/admin/(portal)/*    portal pemilik       app/s/[token]        halaman tamu (QR)
  app/g/[token], gallery  galeri bersama/publik app/api/*           API
  app/live/[token]        galeri live          app/m/[token]        buku tamu (microsite)
  components/event/booth-settings  halaman Pengaturan Booth terpadu
  components/booth        CaptureStage, ReviewStage, FinishStage
  components/frame-builder  editor visual
  lib/frames              tipe desain, renderer, template, konversi frame lama
  lib/ai                  provider OpenRouter/Gemini, gaya, prosesor job
  lib/print               ukuran kertas, layout, sheet, antrean
  print-worker/           worker cetak senyap (Node)
supabase/migrations/      skema (jalankan berurutan)
```

## 3. Instalasi

Butuh **Node.js 20+** dan **pnpm** (`npm i -g pnpm`, atau `npx pnpm@10 …`).

```bash
pnpm install
```

## 4. Menjalankan lokal

1. Buat project di [Supabase](https://supabase.com) (gratis).
2. Siapkan database: `pnpm -s db:sql | pbcopy` (macOS) atau `pnpm -s db:sql > setup.sql`, lalu paste ke **Supabase › SQL Editor › Run**.
   *Sudah pernah setup versi lama?* Jalankan migrasi yang belum ada secara berurutan — `…07_v2_events_frames_gallery.sql`, lalu `…08_v3_booth_live_guestbook.sql`, lalu `…09_v4_y2k_zine_wall.sql` (stiker live wall, tema kulkas, minizine), lalu `…10_v5_payments_storage_devpanel.sql` (pembayaran, panel developer, library stiker, penghitung egress). Semuanya aditif & aman dijalankan ulang; data lama tetap ada. Aplikasi v5 tetap jalan sebelum migrasi 10 dijalankan (pembayaran & library stiker belum aktif).
3. `pnpm configure` — wizard mengisi `apps/web/.env.local`, PIN admin, dan membuat event pertama (kode + PIN).
4. `pnpm dev` → buka `http://localhost:3000`.

> Kamera browser hanya jalan di **HTTPS** atau `localhost`. iPad yang membuka `http://192.168.x.x:3000` tidak bisa memakai kamera — pakai deployment HTTPS (lihat [DEPLOYMENT.md](DEPLOYMENT.md)) atau tunnel HTTPS.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `pnpm build` / `pnpm booth` | Build produksi / build + start (+ worker cetak jika `PRINTER_NAME` diisi) |
| `pnpm print` · `pnpm print -- --list` | Worker cetak saja · daftar printer |
| `pnpm --filter @photovoks/web configure --pin` | Ganti PIN admin |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | Pemeriksaan kode |

## 5. Environment variables

Lihat `apps/web/.env.example`. Ringkasnya:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Project Supabase. URL juga dipakai untuk CSP. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server saja.** |
| `ADMIN_SESSION_SECRET` | ✅ | ≥ 32 karakter acak. Menandatangani cookie admin & cookie PIN event. |
| `OPENROUTER_API_KEY` | untuk AI | **Server saja.** Kosong = Gaya AI tidak tampil. |
| `OPENROUTER_MODEL` | – | Default `google/gemini-2.5-flash-image`. |
| `OPENROUTER_API_MODE` | – | `images` (default, `POST /api/v1/images`) atau `chat` (`/chat/completions` + `modalities`). |
| `APP_URL` | – | URL publik app, dikirim sebagai `HTTP-Referer` ke OpenRouter. |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL_NAME` | – | Provider lama (Gemini langsung) jika `AI_PROVIDER=gemini`. |
| `PRINTER_NAME`, `PRINT_EVENT_CODES`, `PRINT_MEDIA`, `PRINT_LP_OPTIONS`, `PRINT_WORKER` | – | Hanya di PC printer untuk worker senyap. |

Tidak ada API key yang dikirim ke browser; hanya variabel `NEXT_PUBLIC_*` yang masuk bundle klien.

## 6. Setup OpenRouter

1. Buat akun di [openrouter.ai](https://openrouter.ai), isi kredit, buat key di **Keys**.
2. Isi `OPENROUTER_API_KEY` (lokal: `.env.local` / `pnpm configure`; produksi: env Vercel), lalu restart/redeploy.
3. Pilih model gambar yang **menerima input gambar** (image-to-image). Cek di <https://openrouter.ai/models> (filter output: image) atau `GET https://openrouter.ai/api/v1/images/models` untuk parameter yang didukung. Ganti cukup lewat `OPENROUTER_MODEL`.
4. Jika model hanya tersedia lewat chat completions, set `OPENROUTER_API_MODE=chat`.
5. Uji: **Portal Pemilik › Prompt AI › (event) › Tes prompt** dengan foto contoh — tanpa menyimpan apa pun. Status AI juga tampil di Dashboard.
6. Kendalikan biaya: **Pengaturan Booth › Fitur tamu › Gaya AI** → maks. hasil per sesi dan batas harian per event. *Tamu boleh menulis prompt sendiri* bisa dimatikan kapan saja.

Menambah gaya: tambahkan item di `apps/web/lib/ai/styles.ts`. Menambah provider: implementasikan `ImageProvider` di `lib/ai/` dan daftarkan di `lib/ai/provider.ts`.

## 7. Membuat event

1. **Portal Pemilik** (`/admin`, PIN admin) › **Event › Tambah Event** → nama, kode (opsional, otomatis), **PIN event**.
2. **Kelola** → **Pengaturan Booth** — semuanya di satu halaman:
   - **Layar awal**: upload video (MP4 H.264, ≤ 50 MB) atau gambar, judul, ajakan; pratinjau persis booth.
   - **Frame & QR**: tambah frame dari library, urutkan, dan atur **QR softfile** per frame (*sesuai desain* / *pojok* + ukuran dalam cm / *tanpa QR*). Peringatan muncul bila QR menutupi foto atau < 2 cm.
   - **Sesi foto**, **Cetak**, **Fitur tamu** (stiker + stiker PNG event, Gaya AI, prompt tamu), **Galeri, live & buku tamu**, **Status & akses**. Set status **Aktif** (draft = mode uji).
3. Operator tanpa akses admin cukup buka `/event/KODE` + PIN event untuk mengelola semua hal di atas (ganti kode/PIN hanya pemilik).

## 8. Menggunakan photobooth

1. Di iPad/laptop buka `https://domain/booth/KODE` (atau beranda → isi kode) → masukkan **PIN event** (sekali per perangkat, berlaku 12 jam).
2. iPad: **Share › Add to Home Screen** untuk layar penuh, aktifkan **Guided Access**. Laptop: tahan ikon ⚙ (1 detik) di layar sambutan untuk memilih kamera, mode cermin, layar penuh, atau mengunci booth.
3. Tamu: **ketuk layar → pilih karakter → pilih frame (geser atas-bawah, kategori kiri-kanan) → Mulai foto** → countdown → foto tersimpan, booth menunggu → **Ambil foto 2** saat siap (mode *Otomatis berurutan* tersedia di pengaturan) → **pilih foto terbaik** (jika jumlah foto > slot), ulang foto (↺), filter → **Lanjut** → QR + Cetak + Gaya AI → **Selesai** (otomatis kembali setelah 2 menit tanpa sentuhan).
4. Jika upload gagal (internet putus), foto tetap di perangkat dan tombol **Coba lagi** muncul.

## 9. Galeri

- **Portal event › Galeri**: semua sesi event (scroll tak terbatas). Klik → tab *Hasil / Live / Foto / AI*, unduh, cetak, buka halaman tamu, sembunyikan dari galeri bersama, hapus.
- **Riwayat Sesi**: tabel dengan filter waktu/status, statistik, export CSV.
- **Galeri live**: aktifkan di Pengaturan Booth › Galeri, live & buku tamu, lalu buka link `/live/…` di laptop yang tersambung proyektor/TV (tombol layar penuh di pojok kanan atas).
- **Buku tamu**: aktifkan di tempat yang sama. Link muncul di halaman softfile tamu dan sebagai QR di galeri live. Moderasi di **Buku Tamu**.
- **Visibilitas** (Pengaturan Booth › Galeri, live & buku tamu): *Privat* (default — tamu hanya melihat sesinya sendiri lewat QR), *Dengan link* (`/g/<token>` untuk semua tamu), *Publik* (juga di `/gallery`). Link galeri berupa token acak 128-bit.
- **Portal Pemilik › Galeri**: semua sesi semua event.

## 10. Frame Builder

**Portal Pemilik › Frame Builder › Frame baru** (atau pilih template).

- Toolbar kiri: Slot foto, Teks, Kotak, Lingkaran, Garis, Barcode, Gambar (PNG/JPG/WebP ≤10 MB). Gambar dengan rasio sama dengan kanvas otomatis jadi **overlay penuh** — cocok untuk frame PNG transparan dari Canva/Photoshop.
- Kanvas: klik untuk memilih, seret untuk memindah, kotak kecil untuk resize (**Shift** = proporsional, **Alt** = tanpa snapping). Garis merah muda = snap ke tengah/tepi kanvas & elemen lain.
- Panel kanan berubah sesuai pilihan: posisi/ukuran, perataan, urutan lapisan, opasitas, dan properti khusus (sudut, bingkai, font, warna, jarak huruf, dll). Tanpa pilihan: ukuran kanvas (preset 300 DPI), latar, **tata letak slot otomatis**.
- Shortcut: ⌘/Ctrl+Z / ⇧⌘Z, ⌘D duplikat, Delete, panah (Shift = 10px), ⌘S simpan.
- **Pratinjau** dan mode *Foto contoh* memakai renderer yang sama dengan booth dan file cetak.
- Frame lama (PNG + slot) otomatis terbuka sebagai desain yang bisa diedit.

## 11. Mencetak

- Booth mode *Langsung dari booth*: tombol **Cetak sekarang** langsung mengirim sheet (kertas & jumlah lembar dari pengaturan) ke printer perangkat booth; *atur ukuran* membuka dialog lengkap.
- Cetakan yang diminta tamu dari HP (foto, hasil AI, **foto berstiker**) selalu masuk **antrean Print Station** penyelenggara, apa pun mode booth-nya, sampai batas *Cetak dari HP tamu*.
- Dialog cetak lengkap memakai pratinjau sheet persis (300 DPI). Pilih kertas, tata letak, margin, salinan → dialog print browser.
- Di dialog print browser: pilih printer & ukuran kertas yang sama, **Margins: None**, **Scale: 100%**, matikan *Headers and footers*.
- Strip 2×6 pada kertas 4R otomatis dicetak **2 strip per lembar** (garis potong tipis di tengah).

## 12. Print station

**Mode A — halaman Print Station** (paling mudah): di PC yang tersambung printer buka `/event/KODE/print` (PIN event). Job dari booth/HP tamu muncul tiap 3 detik → **Cetak** (dialog) atau aktifkan **Cetak otomatis**. Untuk cetak tanpa dialog jalankan Chrome khusus:

```bash
# macOS
open -na "Google Chrome" --args --kiosk-printing --user-data-dir=/tmp/pv-print "https://domain/event/KODE/print"
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir=%TEMP%\pv-print https://domain/event/KODE/print
```
(`--kiosk-printing` mencetak ke printer default sistem — atur ukuran kertas default printer ke 4×6.)

**Mode B — worker senyap**: `PRINTER_NAME=… pnpm print` di PC printer (CUPS `lp` di macOS/Linux, SumatraPDF/Paint di Windows). Batasi ke event tertentu dengan `PRINT_EVENT_CODES`. Status worker tampil di halaman Print Station & Dashboard. **Jangan jalankan mode A otomatis dan mode B bersamaan untuk event yang sama.**

Booth di mode *Print station* otomatis memasukkan sesi ke antrean (jumlah salinan dari pengaturan). Tamu bisa meminta cetak dari HP sampai batas *Cetak dari HP tamu*.

## 13. Keterbatasan yang diketahui

- **Pengujian**: typecheck, lint, 36 unit test, build produksi, dan E2E Chromium/WebKit (kamera palsu) terhadap emulator Supabase + endpoint OpenRouter palsu. Fitur v3 (layar awal, QR di frame, stiker, live, buku tamu, prompt tamu) belum diuji di project Supabase asli, printer fisik, dan iPad/iPhone asli.
- **Galeri live** memakai polling tiap 5 detik (bukan websocket) — sengaja, agar jalan di jaringan event mana pun. Ratusan layar sekaligus akan menambah beban API.
- **Video layar awal** diunduh sekali per perangkat dan di-cache browser; file besar memperlambat booth saat pertama dibuka. Format paling aman untuk iPad: MP4 H.264.
- **Stiker** di HP: simpan memakai share sheet (iOS/Android) atau unduhan; emoji digambar dengan font emoji perangkat tamu.
- **Moderasi buku tamu** bersifat reaktif: pesan langsung tampil, pengelola bisa menyembunyikannya. Tidak ada filter kata otomatis.
- **Silent printing** tidak mungkin dari web biasa; hanya Chrome `--kiosk-printing` atau worker. Safari/iPad selalu menampilkan dialog dan bisa mengabaikan `@page size` → pilih ukuran kertas manual. Hasil akhir bergantung driver printer (borderless, skala).
- **iPad Safari** tidak mendukung Fullscreen API untuk halaman → gunakan *Add to Home Screen* + Guided Access. Kamera butuh HTTPS dan izin di Pengaturan › Safari › Kamera.
- **Fungsi serverless**: job AI berjalan via `after()` dengan batas 60 detik (Vercel). Model yang lambat bisa timeout → tamu bisa *Coba lagi* (maks. 3×).
- **Rate limit** di `proxy.ts` disimpan di memori per instance (cukup untuk satu event, bukan proteksi DDoS).
- **Ukuran file**: GIF ±1–3 MB per sesi; strip PNG beberapa MB. Supabase free tier 1 GB storage — atur *masa simpan* dan jadwal hapus otomatis (migrasi `…04_cron…` + edge function).
- **Elemen frame** belum bisa diputar; font terbatas pada 7 font bawaan (bisa ditambah di `app/fonts.ts` + `lib/frames/fonts.ts`).
- **Sesi lama** (sebelum v2) tetap tampil di galeri, tetapi tanpa live photo/thumbnail; hasil doodle lama ditampilkan sebagai hasil AI.
- Cookie PIN event berlaku 12 jam; mengganti PIN mengeluarkan semua perangkat event itu.

Panduan deploy lengkap: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 14. Pembaruan v5 — egress, panel developer, pembayaran, tampilan

### Kenapa egress Supabase habis (dan apa yang diperbaiki)

Log Supabase 24 jam (27 Nov 2026): **±4,9 GB egress dari hanya 14 sesi baru**, padahal total file cuma ±155 MB. `thumb.jpg` diunduh 2.203×, tiap `photo_N.jpg` ±1.300×, `strip.png` 376×, PNG frame 268× — semua *cache MISS*. Penyebab:

1. **Signed URL selalu baru.** Setiap respons API membuat signed URL dengan token baru, jadi browser tidak bisa memakai cache. Print station (poll 3 detik), halaman tamu (poll 2,5 detik saat AI/cetak berjalan), galeri, dan booth (memuat ulang konfigurasi tiap tamu) mengunduh ulang foto ukuran penuh terus-menerus.
2. **File besar ditampilkan sebagai thumbnail** (strip 300 DPI, PNG AI ±1,7 MB, PNG frame ±1,2 MB).

Perbaikan:

- **URL media stabil** `/media/<bucket>/<path>?s=<hmac>` (`app/media/[...path]/route.ts`): URL sama setiap kali → di-cache browser 1 tahun + CDN Vercel 30 hari, ETag/304. File hanya ditarik dari storage **sekali**.
- **Varian kecil**: `?w=480&f=webp` membuat WebP berukuran pas (thumbnail ±10–40 KB alih-alih 0,5–2 MB); GIF dipratinjau sebagai WebP animasi. File asli hanya untuk unduhan & cetak.
- **Kompresi**: hasil AI disimpan sebagai JPEG mozjpeg q90 (±6× lebih kecil dari PNG), aset frame/stiker/gambar layar awal dikompres di browser (WebP, transparansi tetap) sebelum upload.
- **Polling** dijeda saat tab tidak terlihat; interval live wall & print station diatur di panel developer.
- **Tanpa round-trip "sign"** ke Supabase (sebelumnya ±1.700 request/hari).

### Panel Developer (`/admin/developer`)

Status sistem (DB utama/cadangan, migrasi, storage, AI, QRIS), grafik egress 31 hari vs kuota, saklar **mode perawatan / AI / pembayaran / mode hemat**, pilihan **penyimpanan (Supabase ↔ Cloudflare R2/S3)** + tes + **migrasi file**, **database cadangan** (salin data inti ke project Supabase lain), unduh backup konfigurasi, perbandingan alternatif, dan langkah darurat. `GET /api/health` untuk monitor uptime. Env darurat (`MAINTENANCE_MODE`, `STORAGE_DRIVER`, `AI_DISABLED`, `PAYMENTS_DISABLED`, `DB_ACTIVE`) tetap bekerja walau database tidak bisa diakses.

**Kalau kuota habis lagi** (urut rekomendasi): (1) pindahkan foto ke **Cloudflare R2** — egress gratis, 10 GB storage gratis; (2) **Supabase Pro** (±$25/bln, 250 GB egress); (3) **project Supabase baru di organisasi lain** (kuota free dihitung per organisasi) via *Database cadangan*; (4) **VPS** + MinIO (driver S3) + `pnpm booth`.

### Pembayaran per sesi & per gambar AI

- **Pengaturan Booth › Pembayaran**: mode *Gratis / QRIS + kasir / QRIS saja / Kasir saja*, harga per sesi, harga per gambar AI (default **Rp 1.500**).
- **QRIS** via [Aulaa](https://aulaa.co): isi `AULAA_API_KEY` + `AULAA_WEBHOOK_SECRET`, set callback `https://<domain>/api/payments/aulaa/webhook`, daftarkan domain website di project Aulaa (popup QRIS `embed.js`). Status dicek lewat webhook bertanda tangan + cek status berkala.
- **Bayar di kasir**: tamu mendapat kode 4 huruf; operator/admin menyetujui di **Pembayaran** (portal event & portal pemilik, dengan bunyi notifikasi). Operator bisa menggratiskan satu sesi dari menu operator booth (tahan ⚙).
- Server menolak sesi/AI tanpa pembayaran lunas yang belum dipakai (tidak bisa diakali dari browser). AI yang gagal karena filter keamanan mengembalikan pembayarannya.
- **Saklar AI global** ada di Dashboard pemilik dan panel developer.

### Tampilan

- **Font**: Nunito (teks — membulat, ramah, selaras logo bubble & label dashboard era PS2/Xbox 360), Bagel Fat One (judul), **Anton** (pengganti Impact) & **Archivo Black** (pengganti Arial Black) untuk **WordArt**, Orbitron (angka/harga/kode — nuansa tekno Y2K), Pixelify Sans tetap untuk chrome Windows 98.
- **WordArt** (`components/brand/WordArt.tsx`, 10 gaya: pelangi, emas 3D, langit, krom, anggur, outline, hutan 3D, kobalt, permen, lengkung) hanya di momen “judul”: layar awal booth, hasil foto, kasir/LUNAS, live wall kosong, 404, maintenance, panel developer — dan bisa dipakai tamu untuk teks stiker & caption minizine.
- **Stiker**: paket “Lucu” baru (26 stiker kawaii Y2K: kucing oren, kelinci, boba, kaset, bola disko, gemoy, OMG, BFF, slay…) + **library stiker admin** (`/admin/stickers`, dipakai semua event).
- **Minizine**: tema satu klik, 10 tata letak (strip 3, 4 foto, film, bulat, hati…), 9 motif latar, bingkai foto, ukuran & WordArt caption, stiker library.
- **Karakter 3D**: model baru ala PS2 / avatar Xbox 360 — material PBR + tekstur kain prosedural, mata beriris, jari, sneaker bertali, sablon kaos, rim light, refleksi, blob shadow. Tanpa file model (0 egress).

### Login PIN lebih cepat

PIN di-hash ulang otomatis ke bcrypt cost 10 saat login (sebelumnya 12 — ±4× lebih lambat di serverless), query yang tak perlu dilewati, satu navigasi + skeleton instan, dan fungsi Vercel dikunci ke region **syd1** (sama dengan database Sydney) di `vercel.json`.


## 15. v6 — SKCK (Surat Keterangan Cukup Kalcer) & Tebak Lagu

### SKCK — Surat Keterangan Cukup Kalcer (fitur unggulan)
Photozine lipat parodi surat keterangan, dibuat dari foto sesi. Penerbit fiktif: **biro urusan kalcer**. Kategori: anak baru kalcer, bikunholic, cekrek profesional, dandan maksimal.

- 8 halaman (sampul, pas foto 4×6, pose terdaftar, punggung + barcode, keterangan + stempel "lulus", rumus sidik kalcer, ketentuan + QR, barang bukti) dalam **1 lembar cetak 1 sisi** (A4 / Letter / A5). Tata letak dihitung dalam milimeter per panel, jadi rapi di semua ukuran kertas.
- Tipografi: gotik (UnifrakturMaguntia, Grenze Gotisch, Jacquard 24), Instrument Serif italic untuk teks, mesin ketik untuk isian. **Tidak ada teks huruf kapital semua.**
- Studio: tab **Depan / Belakang / Cara lipat**. "Cara lipat" menampilkan garis lipat berwarna (merah = lipat 1 ke belakang, biru = gunung, hijau = lembah) + 4 langkah bergambar. **PDF / JPG / cetak selalu bersih tanpa garis panduan**, sesuai ukuran kertas.
- Foto SKCK memakai foto yang sudah difilter **tanpa overlay meme** (meme hanya di strip, GIF, dan cetakan), jadi wajah tetap terlihat.
- Kode: `lib/skck/layout.ts` (renderer canvas), `components/skck/SkckStudio.tsx`, `components/skck/FoldSteps.tsx`, `components/skck/SkckPromo.tsx`. Bukan dokumen resmi — tertulis di halaman terakhir.

### Tebak Lagu (Spotify)
- **Mode panggung** (pengunjung belum beli): *Portal Pemilik › Tebak Lagu* → **Putar lagu acak** → ketik tebakan / **Tandai benar** → voucher hadiah.
- **Mode halaman foto** (sudah beli): jendela **TebakLagu.exe** di halaman Foto_kamu; jatah per sesi & kesempatan menebak diatur di konsol.
- Lagu: tempel link Spotify (satu per baris), judul diambil otomatis (oEmbed). Tambahkan penyanyi (untuk petunjuk) & jawaban alternatif. Jawaban dicek di server — judul tidak pernah dikirim ke browser sebelum ronde selesai; pencocokan toleran typo.
- Pemutar: cover/judul/penyanyi ditutup label kaset; tombol ▶ sendiri via Spotify iFrame API. Pemutaran mengikuti Spotify (tanpa login biasanya pratinjau ±30 detik).
- Voucher `LAGU-XXXX` → tandai **Tukar** di konsol.
- Database: jalankan `supabase/migrations/20240101000011_v6_song_guess.sql`.
