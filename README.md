# 📸 Photovoks

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
| **Booth** | Layar sambutan → pilih frame → kamera (preview dipotong persis ke rasio slot) → countdown → N foto otomatis/manual → pilih foto terbaik + ulang foto + filter → komposisi → QR, cetak, Gaya AI. Auto-kembali ke awal saat idle. |
| **Live photo / GIF** | Setiap jepretan merekam burst ±1 detik (10 frame). Hasil: GIF *seluruh frame* yang bergerak + sprite per-foto dengan kontrol kecepatan. Semua dari foto sesi yang tersimpan. |
| **Galeri** | Galeri event (pengelola), galeri bersama via link (`/g/…`), galeri publik global (`/gallery`, hanya event yang memilih *Publik*). Sembunyikan / hapus sesi. Lazy-load + thumbnail. |
| **Frame Builder** | Editor visual: slot foto, teks (7 font, token `{event}` `{date}` `{time}` `{code}`), gambar/overlay PNG, kotak, lingkaran, garis, barcode. Drag, resize 8 arah, snapping + guide, undo/redo, layer, tata letak slot otomatis, template, pratinjau dengan foto contoh. Library frame dipakai ulang lintas event. |
| **Cetak** | Dialog cetak dengan pratinjau persis (4R, strip 2×6, 5×7, postcard, A4–A6, struk 58/80mm), tata letak (otomatis / pas / penuh / 2 per lembar / isi lembar), margin, jumlah salinan. Mode per event: *print station*, *langsung dari booth*, atau *tanpa cetak*. |
| **Print station** | Antrean real-time per event, cetak dari browser (opsional otomatis), tandai tercetak/gagal, cetak ulang, batas cetak tamu. Atau worker Node senyap (`pnpm print`). |
| **AI** | 8 gaya bawaan + "Gaya Event" (prompt kustom berversi). Provider modular: OpenRouter (default) atau Gemini langsung. Bandingkan asli vs AI, unduh, cetak, retry, batas per sesi & per hari. |

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
   *Sudah pernah setup versi lama?* Cukup jalankan file baru `supabase/migrations/20240101000007_v2_events_frames_gallery.sql` — sifatnya aditif, data lama tetap ada.
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
6. Kendalikan biaya: **Pengaturan event › Gaya AI** → maks. hasil per sesi dan batas harian per event.

Menambah gaya: tambahkan item di `apps/web/lib/ai/styles.ts`. Menambah provider: implementasikan `ImageProvider` di `lib/ai/` dan daftarkan di `lib/ai/provider.ts`.

## 7. Membuat event

1. **Portal Pemilik** (`/admin`, PIN admin) › **Event › Tambah Event** → nama, kode (opsional, otomatis), **PIN event**.
2. **Kelola** → **Frame**: pilih frame dari library (urutan = urutan di booth).
3. **Pengaturan**: jumlah foto per sesi, hitung mundur, mode otomatis/manual, ulang foto, live photo, cermin, filter, mode cetak + kertas + salinan, batas cetak tamu, galeri & privasi, masa simpan, Gaya AI. Set status **Aktif** (draft = mode uji).
4. Operator tanpa akses admin cukup buka `/event/KODE` + PIN event untuk mengelola sesi, galeri, print station, frame & pengaturan (ganti kode/PIN hanya pemilik).

## 8. Menggunakan photobooth

1. Di iPad/laptop buka `https://domain/booth/KODE` (atau beranda → isi kode) → masukkan **PIN event** (sekali per perangkat, berlaku 12 jam).
2. iPad: **Share › Add to Home Screen** untuk layar penuh, aktifkan **Guided Access**. Laptop: tahan ikon ⚙ (1,2 detik) di layar sambutan untuk memilih kamera, mode cermin, layar penuh, atau mengunci booth.
3. Tamu: **Mulai → pilih frame → Mulai foto** → countdown tiap foto → **pilih foto terbaik** (jika jumlah foto > slot), ulang foto (↺), filter → **Lanjut** → QR + Cetak + Gaya AI → **Selesai** (otomatis kembali setelah 2 menit tanpa sentuhan).
4. Jika upload gagal (internet putus), foto tetap di perangkat dan tombol **Coba lagi** muncul.

## 9. Galeri

- **Portal event › Galeri**: semua sesi event (scroll tak terbatas). Klik → tab *Hasil / Live / Foto / AI*, unduh, cetak, buka halaman tamu, sembunyikan dari galeri bersama, hapus.
- **Riwayat Sesi**: tabel dengan filter waktu/status, statistik, export CSV.
- **Visibilitas** (Pengaturan › Galeri & privasi): *Privat* (default — tamu hanya melihat sesinya sendiri lewat QR), *Dengan link* (`/g/<token>` untuk semua tamu), *Publik* (juga di `/gallery`). Link galeri berupa token acak 128-bit.
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

- Tombol **Cetak** membuka dialog dengan pratinjau sheet persis (300 DPI). Pilih kertas, tata letak, margin, salinan → dialog print browser.
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

- **Belum diuji dengan layanan sungguhan.** Verifikasi dilakukan dengan typecheck, lint, 28 unit test, build produksi, dan E2E Chromium (kamera palsu) terhadap emulator Supabase + endpoint OpenRouter palsu di mesin pengembang. Perlu diuji di project Supabase Anda, dengan key OpenRouter asli, printer fisik, dan iPad Safari asli.
- **Silent printing** tidak mungkin dari web biasa; hanya Chrome `--kiosk-printing` atau worker. Safari/iPad selalu menampilkan dialog dan bisa mengabaikan `@page size` → pilih ukuran kertas manual. Hasil akhir bergantung driver printer (borderless, skala).
- **iPad Safari** tidak mendukung Fullscreen API untuk halaman → gunakan *Add to Home Screen* + Guided Access. Kamera butuh HTTPS dan izin di Pengaturan › Safari › Kamera.
- **Fungsi serverless**: job AI berjalan via `after()` dengan batas 60 detik (Vercel). Model yang lambat bisa timeout → tamu bisa *Coba lagi* (maks. 3×).
- **Rate limit** di `proxy.ts` disimpan di memori per instance (cukup untuk satu event, bukan proteksi DDoS).
- **Ukuran file**: GIF ±1–3 MB per sesi; strip PNG beberapa MB. Supabase free tier 1 GB storage — atur *masa simpan* dan jadwal hapus otomatis (migrasi `…04_cron…` + edge function).
- **Elemen frame** belum bisa diputar; font terbatas pada 7 font bawaan (bisa ditambah di `app/fonts.ts` + `lib/frames/fonts.ts`).
- **Sesi lama** (sebelum v2) tetap tampil di galeri, tetapi tanpa live photo/thumbnail; hasil doodle lama ditampilkan sebagai hasil AI.
- Cookie PIN event berlaku 12 jam; mengganti PIN mengeluarkan semua perangkat event itu.

Panduan deploy lengkap: **[DEPLOYMENT.md](DEPLOYMENT.md)**.
