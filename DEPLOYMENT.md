# Deployment Guide

Rekomendasi: **Vercel** (web app, HTTPS otomatis) + **Supabase** (database + storage) + PC printer lokal (print station / worker).

Kenapa Vercel cocok: Next.js native, HTTPS & domain gratis (wajib untuk kamera), fungsi serverless cukup untuk API ini. Yang **tidak** bisa jalan di Vercel adalah worker cetak (butuh akses printer fisik) — itu dijalankan di PC event (`pnpm print`) atau diganti halaman Print Station di browser.

Alternatif jika butuh semuanya dalam satu mesin (mis. event tanpa internet stabil): VPS/PC dengan `pnpm booth` di belakang reverse proxy HTTPS (Caddy/Cloudflare Tunnel). Lihat bagian akhir.

---

## 1. Supabase (database & storage)

1. **New project** di <https://supabase.com> — pilih region terdekat (mis. Singapore).
2. **SQL Editor** → jalankan semua migrasi berurutan (`pnpm -s db:sql` menggabungkannya). Untuk project lama cukup `20240101000007_v2_events_frames_gallery.sql`.
3. Periksa **Storage**: bucket `sessions`, `sketches`, `frames` ada dan **privat**.
4. **Project Settings › API**: catat *Project URL*, *anon key*, *service_role key*.
5. (Opsional, disarankan) **Hapus otomatis** sesi kedaluwarsa:
   ```bash
   supabase functions deploy delete-expired-sessions
   ```
   lalu di SQL Editor:
   ```sql
   alter database postgres set app.supabase_project_ref = '<PROJECT_REF>';
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```
   (jadwal pg_cron 02:00 UTC sudah dibuat oleh migrasi `…04_cron…`).
6. Buat PIN admin: jalankan `pnpm configure` sekali dari laptop (menulis `.env.local` dan menyimpan hash PIN di tabel `admin_users`).

## 2. Vercel

1. Push repo ke GitHub.
2. <https://vercel.com/new> → import repo → **Root Directory: `apps/web`**. Framework terdeteksi Next.js; `apps/web/vercel.json` sudah mengatur install pnpm dari root monorepo dan `maxDuration` 60 detik untuk route AI.
3. **Environment Variables** (Production + Preview):

   | Nama | Nilai |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**jangan** diberi prefix `NEXT_PUBLIC_`) |
   | `ADMIN_SESSION_SECRET` | sama dengan di `.env.local` (≥ 32 karakter acak) |
   | `OPENROUTER_API_KEY` | key OpenRouter |
   | `OPENROUTER_MODEL` | mis. `google/gemini-2.5-flash-image` |
   | `APP_URL` | `https://domain-anda` (opsional) |

   **Jangan** set `PRINTER_NAME` di Vercel.
4. **Deploy**. Setiap perubahan env butuh **Redeploy** (env `NEXT_PUBLIC_*` & CSP dibaca saat build).

Catatan Vercel:
- Plan Hobby: fungsi maks. 60 detik — cukup untuk kebanyakan model gambar. Job AI berjalan di `after()` dalam fungsi yang sama.
- Upload foto langsung dari browser ke Supabase (signed URL), jadi tidak terkena batas body 4,5 MB Vercel.

## 3. Domain & HTTPS

1. Vercel › Project › **Settings › Domains** → tambah domain (mis. `booth.namaanda.com`) → ikuti instruksi DNS (CNAME ke `cname.vercel-dns.com`).
2. Sertifikat HTTPS dibuat otomatis. **Kamera hanya bekerja di HTTPS** — selalu buka booth lewat `https://`.
3. Isi `APP_URL` dengan domain final lalu redeploy.

## 4. Kamera — persyaratan

- HTTPS (atau `localhost`).
- Header `Permissions-Policy: camera=(self)` sudah dikirim app — jangan embed booth di iframe domain lain.
- iPad: Pengaturan › Safari › Kamera › *Tanya/Izinkan*; untuk mode PWA (*Add to Home Screen*) izin diminta sekali per aplikasi.
- Laptop: Chrome › ikon kamera di address bar › Izinkan. Tutup aplikasi lain yang memakai webcam.

## 5. OpenRouter di produksi

1. Isi kredit, buat key khusus produksi (bisa diberi limit kredit di dashboard OpenRouter).
2. Set `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` di Vercel → redeploy.
3. Dashboard admin harus menampilkan "AI siap · openrouter · <model>".
4. Uji di **Prompt AI › Tes prompt**. Jika error "model tidak mendukung input gambar" → ganti model; jika model hanya via chat → `OPENROUTER_API_MODE=chat`.

## 6. Print station saat event

- **Mudah**: PC printer buka `https://domain/event/KODE/print` (PIN event). Untuk otomatis tanpa dialog jalankan Chrome dengan `--kiosk-printing` (lihat README §12).
- **Worker senyap**: di PC printer
  ```bash
  git clone … && pnpm install
  # .env.local cukup: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRINTER_NAME, (PRINT_EVENT_CODES)
  pnpm print
  ```
  Worker mengirim heartbeat (status "online" di portal) dan memproses job satu per satu.

## 7. Checklist setelah deploy

1. `https://domain/` tampil; `/admin` mengarah ke PIN; login admin berhasil.
2. **Dashboard**: database terhubung, AI siap.
3. Buat event (kode + PIN) → buat frame dari template → pilih frame di event → status *Aktif*.
4. iPad: buka `/booth/KODE` → PIN → izinkan kamera → foto 1 sesi penuh → QR muncul.
5. Scan QR dengan HP (data seluler) → halaman tamu tampil, GIF bergerak, unduh berhasil.
6. Coba **Gaya AI** → hasil muncul ≤ 60 detik.
7. Cetak: mode *Print station* → job muncul di `/event/KODE/print` → cetak 1 lembar 4R, cek ukuran & potongan. Mode *Langsung* → dialog print dari booth.
8. **Riwayat Sesi** & **Galeri** menampilkan sesi; sembunyikan/hapus berfungsi.
9. Jika galeri diatur *Dengan link*, buka `/g/<token>` di jendela incognito.
10. Cek **Supabase › Storage** terisi di `sessions/<id>/…` dan pemakaian kuota.

## 8. Alternatif: satu mesin lokal (tanpa Vercel)

```bash
pnpm configure           # isi PRINTER_NAME di mesin ini
pnpm booth               # build + start di port 3000 + worker cetak
```
Kamera di perangkat lain butuh HTTPS: pasang **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:3000`) atau Caddy dengan domain sendiri, lalu buka booth lewat URL HTTPS tersebut. Database & storage tetap di Supabase (butuh internet).
