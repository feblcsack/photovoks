# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Middleware Tidak Terdaftar dan Upsert False
  - **CRITICAL**: Test ini HARUS GAGAL pada kode unfixed — kegagalan mengkonfirmasi bug ada
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: Test ini mengkodekan perilaku yang diharapkan — akan memvalidasi fix ketika pass setelah implementasi
  - **GOAL**: Surface counterexample yang mendemonstrasikan bug ada
  - **Scoped PBT Approach**: Scope ke kasus konkret: (a) baca `middleware-manifest.json` → assert entry `middleware` kosong; (b) mock `createSignedUploadUrl` dengan path yang sudah ada + `upsert: false` → assert error dikembalikan
  - Test Case A — Middleware Registration: baca `.next/server/middleware-manifest.json`, assert bahwa `middleware` key adalah object kosong `{}` (membuktikan Next.js tidak mendaftarkan middleware sama sekali)
  - Test Case B — Signed URL Upsert: mock Supabase Storage `createSignedUploadUrl` dengan storage path yang sudah ada dan flag `{ upsert: false }`, assert bahwa fungsi mengembalikan error (bukan signed URL)
  - Test Case C — Upload Flow Without Auth: simulate POST ke `/api/admin/frames/upload-url` tanpa cookie `admin_token`, assert bahwa response BUKAN 401 (membuktikan tidak ada proteksi)
  - Jalankan test pada kode UNFIXED
  - **EXPECTED OUTCOME**: Test GAGAL atau surface counterexample (ini benar — membuktikan bug ada)
  - Document counterexample yang ditemukan untuk memahami root cause
  - Mark task complete ketika test ditulis, dijalankan, dan kegagalan didokumentasikan
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Validasi Form dan Perilaku Non-Upload
  - **IMPORTANT**: Ikuti observation-first methodology
  - Observe: `handleFileChange` pada file non-PNG → error "Only PNG files are accepted for frames." pada kode unfixed
  - Observe: submit form tanpa file dipilih → tombol tetap disabled pada kode unfixed
  - Observe: submit form tanpa nama frame → error "Frame name is required." pada kode unfixed
  - Observe: setelah upload sukses → redirect ke `/admin/frames/{frameId}/edit?eventId={eventId}` pada kode unfixed
  - Property-based test: untuk semua ekstensi file non-PNG (random string yang tidak berakhiran `.png`), `handleFileChange` selalu set error "Only PNG files are accepted for frames." dan set file ke null
  - Property-based test: untuk semua kombinasi state form dengan `file = null`, tombol submit selalu disabled
  - Property-based test: untuk semua nama frame yang kosong atau whitespace-only dengan file PNG valid, submit selalu menampilkan "Frame name is required."
  - Jalankan test pada kode UNFIXED
  - **EXPECTED OUTCOME**: Test PASS (mengkonfirmasi baseline behavior yang harus dipreserve)
  - Mark task complete ketika test ditulis, dijalankan, dan passing pada kode unfixed
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix frame upload — middleware registration, upsert flag, dan disabled button hint

  - [x] 3.1 Rename export `proxy` → `middleware` di `apps/web/proxy.ts`
    - Ubah `export async function proxy(request: NextRequest)` menjadi `export async function middleware(request: NextRequest)`
    - Tidak ada perubahan lain pada file ini — logic, `config` export, dan matcher sudah benar
    - Setelah rename, Next.js akan mendaftarkan file sebagai Edge Middleware
    - Verifikasi: setelah build, `.next/server/middleware-manifest.json` harus menunjukkan entry non-kosong di `"middleware"` key
    - _Bug_Condition: middlewareNotRegistered() — `proxy.ts` mengekspor nama `proxy` bukan `middleware`, sehingga Next.js tidak pernah mendaftarkannya sebagai Edge Middleware_
    - _Expected_Behavior: request ke `/admin/*` dan `/api/admin/*` divalidasi JWT sebelum diproses; request tanpa `admin_token` valid di-redirect ke `/admin/pin`_
    - _Preservation: logic rate limiting, JWT validation, redirect behavior, dan `config` matcher tidak berubah_
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Ubah `upsert: false` → `upsert: true` di `apps/web/app/api/admin/frames/upload-url/route.ts`
    - Ubah baris `createSignedUploadUrl(storagePath, { upsert: false })` menjadi `createSignedUploadUrl(storagePath, { upsert: true })`
    - Ini memungkinkan retry upload ke storage path yang sama tanpa error 500
    - Tidak ada perubahan lain pada file ini
    - _Bug_Condition: `createSignedUploadUrl` dipanggil dengan `{ upsert: false }` sehingga gagal jika storage path sudah ada_
    - _Expected_Behavior: signed upload URL berhasil dibuat untuk path berapapun, termasuk path yang sudah ada di storage_
    - _Preservation: response format `{ signedUrl, storagePath }`, validasi `frameId`, dan error handling untuk body/JSON invalid tidak berubah_
    - _Requirements: 2.2_

  - [x] 3.3 Tambahkan hint teks disabled state di `apps/web/app/admin/frames/FrameUploadForm.tsx`
    - Tambahkan teks helper di bawah atau dekat tombol "Upload Frame" yang muncul hanya ketika `!file && !isUploading`
    - Teks hint: "Pilih file PNG untuk mengaktifkan tombol upload." (atau teks serupa dalam Bahasa Indonesia)
    - Teks hint harus hilang ketika `file` sudah dipilih
    - Gunakan elemen `<p>` atau `<span>` kecil dengan class text gray/muted agar tidak confusing dengan error messages
    - _Bug_Condition: tidak ada penjelasan visual ketika tombol disabled karena belum ada file dipilih_
    - _Expected_Behavior: admin melihat hint teks yang menjelaskan mengapa tombol disabled_
    - _Preservation: semua validasi form lain, upload flow 3-step, error display, dan redirect pasca-sukses tidak berubah_
    - _Requirements: 2.1_

  - [x] 3.4 Verify bug condition exploration test sekarang pass
    - **Property 1: Expected Behavior** - Middleware Terdaftar dan Upload Berhasil
    - **IMPORTANT**: Re-run test YANG SAMA dari task 1 — JANGAN tulis test baru
    - Test dari task 1 mengkodekan perilaku yang diharapkan
    - Test Case A: middleware-manifest.json sekarang menunjukkan entry middleware yang terdaftar
    - Test Case B: `createSignedUploadUrl` dengan path yang sudah ada dan `upsert: true` berhasil (tidak error)
    - Test Case C: request tanpa `admin_token` di-redirect ke `/admin/pin` (respons 307/302, bukan diteruskan)
    - **EXPECTED OUTCOME**: Test PASS (mengkonfirmasi bug sudah diperbaiki)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests masih pass
    - **Property 2: Preservation** - Validasi Form dan Perilaku Non-Upload
    - **IMPORTANT**: Re-run test YANG SAMA dari task 2 — JANGAN tulis test baru
    - Jalankan semua property-based preservation tests dari task 2
    - Verifikasi non-PNG rejection, disabled button, empty name validation, dan post-success redirect tetap berperilaku sama
    - **EXPECTED OUTCOME**: Test PASS (mengkonfirmasi tidak ada regresi)
    - Konfirmasi semua test pass setelah fix (no regressions)

- [x] 4. Checkpoint — Pastikan semua test pass
  - Jalankan seluruh test suite untuk `apps/web`
  - Pastikan bug condition exploration test (task 1) pass pada kode fixed
  - Pastikan semua preservation tests (task 2) masih pass
  - Verifikasi build Next.js berhasil dan `middleware-manifest.json` menunjukkan middleware terdaftar
  - Tanyakan kepada user jika ada pertanyaan atau ambiguitas yang muncul
