# 📸 Photovoks

Photobooth web app untuk event: pengunjung pilih bingkai → foto 3x → **photostrip langsung tercetak otomatis** → scan QR untuk unduh foto dan **ubah fotonya jadi doodle dengan AI (Google Gemini)**, yang juga bisa dicetak.

```
iPad (browser)  ──►  Website Photovoks  ──►  Supabase (database + penyimpanan foto)
                          │                         ▲
                          └── Gemini (doodle AI)    │
                                                    │
Laptop + printer  ──  pnpm print  ──────────────────┘  (ambil antrian → cetak)
```

Tidak ada lagi aplikasi Electron "print-station". Pencetakan dikerjakan oleh **print worker** kecil yang:
- otomatis ikut jalan di dalam `pnpm booth` (kalau website dijalankan di laptop yang sama), **atau**
- dijalankan sendiri dengan `pnpm print` (kalau website di-hosting online).

---

## Pilih cara pakai

| | **A. Online (disarankan)** | **B. Semua di 1 laptop** |
|---|---|---|
| Website | Vercel (gratis, HTTPS otomatis) | `pnpm booth` di laptop |
| Laptop printer menjalankan | `pnpm print` | `pnpm booth` (sudah termasuk printer) |
| Booth | iPad/HP mana saja | Laptop itu sendiri (webcam/touchscreen) |
| QR bisa dibuka tamu dari data seluler | ✅ | ❌ hanya yang satu Wi-Fi* |

\* Kamera di browser hanya boleh dipakai lewat **HTTPS** atau `localhost`. Jadi iPad yang membuka `http://192.168.x.x:3000` **tidak bisa** memakai kamera — itu sebabnya mode A disarankan kalau booth-nya iPad.

---

## Setup (sekali saja, ±15 menit)

### 0. Yang perlu disiapkan
- [Node.js 20+](https://nodejs.org) dan pnpm: `npm install -g pnpm`
- Akun [Supabase](https://supabase.com) (gratis)
- API key [Google AI Studio](https://aistudio.google.com/apikey) (untuk doodle AI — opsional)
- Printer sudah ter-install di laptop (bisa cetak foto 4×6 / 4R)

### 1. Install
```bash
git clone <repo-ini> photovoks && cd photovoks
pnpm install
```

### 2. Siapkan database
1. Buat project baru di Supabase.
2. Jalankan `pnpm -s db:sql | pbcopy` (macOS — Windows: `pnpm -s db:sql > setup.sql` lalu buka file-nya).
3. Supabase Dashboard → **SQL Editor** → paste → **Run**.

### 3. Jalankan wizard
```bash
pnpm configure
```
Wizard akan menanyakan: URL & key Supabase (Project Settings → API), Gemini API key, printer mana yang dipakai (otomatis dideteksi), dan **PIN admin**. Wizard juga membuat event pertama dan menulis semuanya ke `apps/web/.env.local` (file ini rahasia, tidak ikut ke git).

> Belum punya printer? Pilih **`d` (dry-run)** — hasil cetak disimpan sebagai file di folder `apps/web/print-output/` untuk dicek.

### 4a. Mode A — deploy ke Vercel
1. Push repo ke GitHub → di [Vercel](https://vercel.com/new) import repo, **Root Directory: `apps/web`**.
2. Environment Variables: salin isi `apps/web/.env.local` **kecuali `PRINTER_NAME`**.
3. Deploy. Buka `https://<app>.vercel.app` di iPad → Share → **Add to Home Screen** (jadi full-screen).

### 4b. Mode B — semua lokal
```bash
pnpm booth
```
Buka `http://localhost:3000` di laptop.

### 5. Upload bingkai
Buka `/admin` (di layar booth: **ketuk 5x pojok kanan atas**) → masukkan PIN → **Frames** → upload PNG bingkai 600×1800 transparan & atur posisi 3 slot foto.

---

## Operasional harian ✅

| Mode | Yang dilakukan saat event |
|---|---|
| A | Nyalakan printer → di laptop: `pnpm print` → buka app di iPad |
| B | Nyalakan printer → `pnpm booth` |

Cek **/admin/dashboard**: status printer (Online/Offline), Doodle AI (Aktif/Nonaktif), antrian cetak, tombol *Cetak Ulang*.

### Alur pengunjung
1. Ketuk layar → setuju → pilih bingkai → foto 3x (countdown) → pratinjau.
2. Ketuk satu foto untuk dijadikan doodle AI → **Cetak**.
3. Strip tercetak otomatis. Layar menampilkan QR.
4. Tamu scan QR → unduh strip → **Buat Doodle AI ✨** (±20 detik) → unduh / **Cetak Doodle**.

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm configure` | Wizard setup (aman diulang; jawaban lama jadi default) |
| `pnpm --filter @photovoks/web configure --pin` | Ganti PIN admin saja |
| `pnpm booth` | Build + jalankan website (+ printer jika `PRINTER_NAME` diisi) |
| `pnpm print` | Jalankan printer saja (untuk mode A) |
| `pnpm print -- --list` | Lihat nama printer di komputer ini |
| `pnpm dev` | Mode development |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` | Pemeriksaan kode |

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Dashboard: printer **Offline** | Pastikan `pnpm print`/`pnpm booth` jalan dan `PRINTER_NAME` benar (`pnpm print -- --list`). |
| Ukuran cetak salah (macOS) | Tambah di `.env.local`: `PRINT_MEDIA=w288h432` (nama media dari `lpoptions -p <printer> -l`). |
| Windows tidak mencetak | Install [SumatraPDF](https://www.sumatrapdfreader.org) (lebih akurat); tanpa itu dipakai Paint. |
| Kamera tidak muncul di iPad | Harus HTTPS (mode A) dan izinkan kamera di Safari. |
| Doodle "tidak aktif" | Isi `GEMINI_API_KEY` (`pnpm configure`), lalu restart / redeploy. |
| Doodle gagal terus | Cek kuota Gemini; batas per hari diatur di **Events → Daily sketch cap**. |
| Lupa PIN / terkunci | `pnpm --filter @photovoks/web configure --pin` |

## Keamanan
- Semua key rahasia (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ADMIN_SESSION_SECRET`) hanya di server — tidak pernah dikirim ke browser.
- Database terkunci RLS; browser tidak bisa membaca sesi/foto/antrian cetak secara langsung. Foto hanya bisa diakses lewat signed URL berumur pendek.
- Sesi admin: cookie `httpOnly` + `SameSite=Strict`, kadaluarsa 30 menit, auto-logout 10 menit idle; PIN di-hash bcrypt, terkunci 5 menit setelah 5x salah, plus rate limit.
- Link QR memakai token acak 96-bit; ada rate limit untuk pembuatan sesi, doodle, dan cetak.
- Header keamanan: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, kamera hanya untuk situs ini.
- Hapus otomatis foto lama: migrasi `..._cron_delete_expired_sessions.sql` + edge function `supabase/functions/delete-expired-sessions` (opsional, butuh `supabase functions deploy` & Vault secret — lihat komentar di file migrasinya).
