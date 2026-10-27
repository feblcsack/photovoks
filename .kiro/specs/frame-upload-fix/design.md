# Frame Upload Fix — Bugfix Design

## Overview

Admin tidak bisa mengupload frame di halaman `/admin/frames`. Tombol "Upload Frame" dalam
keadaan disabled selama tidak ada file yang dipilih, namun masalah yang lebih mendasar adalah
bahwa **middleware autentikasi tidak aktif sama sekali** — `proxy.ts` mengekspor fungsi bernama
`proxy`, bukan `middleware`, sehingga Next.js tidak pernah mendaftarkannya sebagai Edge Middleware
(dikonfirmasi oleh `middleware-manifest.json` yang kosong). Akibatnya, semua `/api/admin/*` route
tidak terproteksi dan request dari browser yang tidak terautentikasi bisa saja ditolak oleh
Supabase RLS atau menghasilkan error 500 yang tidak jelas — bukan 401 yang bisa di-handle form.

Selain itu, `createSignedUploadUrl` dipanggil dengan `{ upsert: false }`, sehingga retry setelah
partial failure (misalnya DB write gagal tapi storage sudah ada) akan selalu error. Error saat
PUT ke Supabase Storage juga tidak menampilkan pesan yang cukup informatif kepada admin.

Strategi fix:
1. Rename `proxy` export → `middleware` di `proxy.ts` (atau buat `middleware.ts` yang re-export)
   agar Next.js mendaftarkan Edge Middleware dengan benar.
2. Ubah `upsert: false` → `upsert: true` di `upload-url/route.ts`.
3. Tambahkan hint teks pada tombol "Upload Frame" ketika belum ada file dipilih.
4. Perbaiki error detail saat upload storage gagal (sudah sebagian ada, pastikan konsisten).

---

## Glossary

- **Bug_Condition (C)**: Kondisi yang memicu kegagalan upload — terjadi ketika admin memilih file
  PNG valid, mengisi nama frame, dan mengklik "Upload Frame", namun proses upload gagal atau
  tombol tidak bisa digunakan.
- **Property (P)**: Perilaku yang diharapkan — upload berhasil melalui 3 langkah berurutan
  (signed URL → PUT storage → POST DB record) dan admin diredirect ke halaman edit slot.
- **Preservation**: Perilaku validasi form dan redirect pasca-sukses yang sudah benar dan **tidak
  boleh berubah** akibat fix.
- **`proxy` / `middleware`**: Fungsi Edge Middleware di `apps/web/proxy.ts` yang seharusnya
  memvalidasi cookie `admin_token` sebelum meneruskan request ke `/admin/*` dan `/api/admin/*`.
- **`createSignedUploadUrl`**: Method Supabase Storage yang menghasilkan signed URL untuk upload
  langsung dari client ke bucket `frames`.
- **`upsert`**: Flag pada `createSignedUploadUrl` — jika `false`, request akan gagal jika path
  sudah ada di storage; jika `true`, path yang sudah ada akan di-overwrite (aman untuk retry).
- **`admin_token`**: Cookie HttpOnly-equivalent yang menyimpan JWT admin, diset oleh
  `/api/admin/verify-pin` dan divalidasi oleh Edge Middleware.

---

## Bug Details

### Bug Condition

Bug termanifestasi dalam dua lapisan:

**Lapisan 1 — Middleware tidak aktif:**
`proxy.ts` mengekspor `export async function proxy(...)` bukan `export async function middleware(...)`.
Next.js hanya mendaftarkan Edge Middleware dari file `middleware.ts` (atau `middleware.js`) di root
direktori app dengan export bernama `middleware`. Karena export salah nama, semua proteksi admin
gagal secara silent — middleware tidak pernah dipanggil sama sekali.

**Lapisan 2 — `upsert: false` pada signed upload URL:**
Ketika admin mencoba retry upload setelah partial failure (storage berhasil tapi DB write gagal),
`createSignedUploadUrl` dengan `{ upsert: false }` mengembalikan error karena storage path sudah
ada. Error ini diteruskan sebagai HTTP 500 ke client tanpa pesan yang jelas.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type UploadAttempt {
    file: File (PNG),
    frameName: string (non-empty),
    adminTokenCookie: string | undefined,
    storagePathAlreadyExists: boolean
  }
  OUTPUT: boolean

  -- Bug condition terpenuhi jika SALAH SATU dari kondisi berikut true:
  RETURN (
    -- Condition A: middleware tidak mendaftarkan proteksi → redirect loop atau 500
    middlewareNotRegistered()

    -- Condition B: retry setelah partial failure → signed URL error
    OR (input.storagePathAlreadyExists AND upsertFlag = false)
  )
END FUNCTION
```

### Examples

- **Contoh 1 (Condition A — utama):** Admin login, buka `/admin/frames?eventId=xxx`, pilih file
  PNG, isi nama, klik "Upload Frame". Request ke `/api/admin/frames/upload-url` berhasil (karena
  service role key di-server, tidak perlu cookie), tapi jika Supabase RLS aktif atau ada guard
  lain, bisa gagal. Selain itu, tanpa middleware, halaman `/admin/*` bisa diakses tanpa login.
  *Expected:* request diproteksi oleh JWT; *Actual:* tidak ada proteksi.

- **Contoh 2 (Condition B — retry):** Admin melakukan upload pertama: step 1 (signed URL) dan
  step 2 (PUT ke storage) berhasil, tapi step 3 (POST ke `/api/admin/frames`) gagal karena DB
  error. Admin klik "Upload Frame" lagi dengan file yang sama. Step 1 gagal dengan error 500
  karena `frameId` baru di-generate, tapi nama path di storage sudah ada (jika `frameId` sama —
  meski dalam implementasi saat ini `frameId` selalu baru, ini tetap masalah desain).
  *Expected:* signed URL berhasil dibuat dengan `upsert: true`; *Actual:* error 500.

- **Contoh 3 (Condition A — disabled state):** Jika admin belum memilih file, tombol disabled
  tanpa penjelasan. *Expected:* ada hint teks "Pilih file PNG terlebih dahulu"; *Actual:* tombol
  hanya grey tanpa konteks.

- **Edge Case:** File PNG dipilih tapi berukuran 0 byte — validasi ekstensi lolos, tapi upload
  ke Supabase Storage mungkin gagal. Tidak ada validasi ukuran file saat ini.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- WHEN admin memilih file non-PNG (ekstensi bukan `.png`) THEN form SHALL CONTINUE TO menolak
  file dan menampilkan "Only PNG files are accepted for frames."
- WHEN admin submit form tanpa file dipilih THEN tombol SHALL CONTINUE TO dalam keadaan disabled
  dan mencegah submission
- WHEN admin submit form tanpa nama frame THEN form SHALL CONTINUE TO menampilkan "Frame name is
  required." dan tidak memproses upload
- WHEN upload frame berhasil sepenuhnya THEN form SHALL CONTINUE TO meredirect ke
  `/admin/frames/{frameId}/edit?eventId={eventId}`
- WHEN upload frame berhasil THEN sistem SHALL CONTINUE TO menyimpan DB record dengan
  `is_active: true` dan `sort_order` auto-increment

**Scope:**
Semua input yang TIDAK terkait dengan alur upload frame (mouse click pada FrameList, form events,
reorder, toggle active/inactive) harus sama sekali tidak terpengaruh oleh fix ini. Fix terbatas
pada:
- `apps/web/proxy.ts` (rename export)
- `apps/web/app/api/admin/frames/upload-url/route.ts` (upsert flag)
- `apps/web/app/admin/frames/FrameUploadForm.tsx` (hint teks, minor UX)

---

## Hypothesized Root Cause

Berdasarkan analisis kode dan `middleware-manifest.json` yang kosong:

1. **Export Name Mismatch (Root Cause Utama — Dikonfirmasi)**: `proxy.ts` mengekspor
   `export async function proxy(...)` bukan `export async function middleware(...)`. Next.js Edge
   Middleware hanya dikenali dari file bernama `middleware.ts` di root app dengan export bernama
   `middleware`. Bukti: `.next/server/middleware-manifest.json` menunjukkan `"middleware": {}` —
   artinya tidak ada middleware terdaftar sama sekali. Ini adalah bug definitif.

2. **`upsert: false` pada Signed Upload URL**: `createSignedUploadUrl(storagePath, { upsert: false })`
   di `upload-url/route.ts` baris 39. Jika storage path sudah ada (misalnya dari upload sebelumnya
   atau karena UUID collision yang sangat tidak mungkin tapi mungkin), Supabase Storage akan
   mengembalikan error yang diteruskan sebagai 500 ke client.

3. **Kurangnya Hint pada Disabled Button**: Tombol "Upload Frame" disabled ketika `!file` tanpa
   penjelasan visual di dekat tombol. Admin mungkin bingung mengapa tombol tidak aktif.

4. **Error Propagation dari Storage PUT**: Kode sudah mengambil response text dari PUT error, tapi
   format pesan bisa lebih konsisten dan actionable untuk admin.

---

## Correctness Properties

Property 1: Bug Condition — Middleware Terdaftar dan Upload Berhasil

_For any_ upload attempt where the admin has a valid `admin_token` cookie, has selected a PNG
file, has entered a non-empty frame name, and submits the form, the fixed system SHALL:
(a) validate the admin JWT via properly registered Edge Middleware before any API call is
    processed, AND
(b) successfully return a signed upload URL regardless of whether the storage path already exists
    (`upsert: true`), AND
(c) complete the 3-step upload flow (signed URL → PUT storage → POST DB record) without error,
    AND
(d) redirect the admin to `/admin/frames/{frameId}/edit?eventId={eventId}`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Validasi Form dan Perilaku Non-Upload Tidak Berubah

_For any_ input that does NOT trigger a new upload attempt (non-PNG file selection, empty form
submission, mouse interactions with FrameList, reorder/toggle/delete actions), the fixed code
SHALL produce exactly the same behavior as the original code — preserving all existing validation
messages, disabled states, FrameList interactions, and post-success redirect behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Changes Required

#### File 1: `apps/web/proxy.ts`

**Function**: `proxy` → rename to `middleware`

**Specific Changes**:
1. **Rename export**: Ubah `export async function proxy(...)` menjadi `export async function middleware(...)`.
   Next.js hanya mendaftarkan Edge Middleware dari export bernama `middleware`.
2. **Pastikan `config` export masih ada**: `export const config = { matcher: [...] }` sudah ada
   dan benar — tidak perlu diubah.
3. **Verifikasi setelah build**: Setelah rename, `.next/server/middleware-manifest.json` harus
   menunjukkan entry di `"middleware"` bukan object kosong.

**Note**: Alternatif lain adalah membuat file `middleware.ts` baru yang re-export dari `proxy.ts`,
tapi rename langsung lebih bersih karena `proxy.ts` sudah berisi semua logic yang diperlukan.

#### File 2: `apps/web/app/api/admin/frames/upload-url/route.ts`

**Function**: `POST` handler

**Specific Changes**:
1. **Ubah `upsert: false` → `upsert: true`**: Di baris `createSignedUploadUrl(storagePath, { upsert: false })`,
   ubah flag menjadi `{ upsert: true }`. Ini memungkinkan retry upload ke path yang sama tanpa error.

#### File 3: `apps/web/app/admin/frames/FrameUploadForm.tsx`

**Component**: `FrameUploadForm`

**Specific Changes**:
1. **Tambahkan hint teks untuk disabled state**: Ketika `!file`, tampilkan teks helper kecil
   di bawah atau dekat tombol, misalnya "Pilih file PNG untuk mengaktifkan tombol upload."
2. **Pastikan error handling konsisten**: Error dari step 2 (PUT ke storage) sudah menampilkan
   status code — pastikan format konsisten dengan error dari step 1 dan step 3.

---

## Testing Strategy

### Validation Approach

Strategi testing mengikuti dua fase: pertama, surface counterexample yang mendemonstrasikan bug
pada kode yang belum diperbaiki; lalu verifikasi bahwa fix bekerja dan tidak merusak perilaku
yang sudah ada.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexample yang mendemonstrasikan bug SEBELUM fix diimplementasikan.
Konfirmasi atau refutasi root cause analysis. Jika refutasi, kita perlu re-hypothesize.

**Test Plan**: Tulis unit test yang:
1. Me-mock Next.js request ke `/api/admin/frames/upload-url` tanpa cookie `admin_token`
2. Verifikasi bahwa middleware `proxy.ts` tidak terdaftar di Next.js (berdasarkan manifest)
3. Me-mock Supabase Storage `createSignedUploadUrl` dengan storage path yang sudah ada dan `upsert: false`
4. Verifikasi bahwa `FrameUploadForm` button disabled tanpa hint teks

Jalankan test ini pada kode UNFIXED untuk mengobservasi kegagalan dan memahami root cause.

**Test Cases**:
1. **Middleware Registration Test**: Baca `middleware-manifest.json` dan assert bahwa `middleware`
   entry kosong — ini membuktikan middleware tidak aktif (akan pass pada unfixed code, membuktikan bug)
2. **Signed URL Upsert Test**: Panggil `createSignedUploadUrl` dengan path yang sudah ada dan
   `{ upsert: false }` — assert bahwa Supabase mengembalikan error (akan pass pada unfixed code)
3. **Upload Flow Integration Test**: Simulasikan full upload flow tanpa admin token — assert
   bahwa API tidak mengembalikan 401 (akan pass pada unfixed code, membuktikan tidak ada proteksi)
4. **Button Disabled Hint Test**: Render `FrameUploadForm` tanpa file — assert bahwa tidak ada
   hint teks (akan pass pada unfixed code)

**Expected Counterexamples**:
- Middleware manifest kosong → proteksi admin tidak aktif
- `createSignedUploadUrl` dengan `upsert: false` error saat path ada
- API dapat diakses tanpa autentikasi

### Fix Checking

**Goal**: Verifikasi bahwa untuk semua input di mana bug condition terpenuhi, fungsi yang sudah
diperbaiki menghasilkan perilaku yang diharapkan.

**Pseudocode:**
```
FOR ALL uploadAttempt WHERE isBugCondition(uploadAttempt) DO
  result := fixedUploadFlow(uploadAttempt)
  ASSERT middlewareIsRegistered()
  ASSERT signedUrlSucceeds(upsert=true)
  ASSERT result.status = 'redirected_to_edit'
END FOR
```

### Preservation Checking

**Goal**: Verifikasi bahwa untuk semua input di mana bug condition TIDAK terpenuhi, kode yang
sudah diperbaiki menghasilkan hasil yang sama dengan kode original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFormBehavior(input) = fixedFormBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing direkomendasikan untuk preservation checking karena:
- Menghasilkan banyak test case secara otomatis di seluruh domain input
- Menangkap edge case yang manual unit test mungkin lewatkan
- Memberikan jaminan kuat bahwa perilaku tidak berubah untuk semua input non-buggy

**Test Plan**: Observasi perilaku pada kode UNFIXED untuk validasi form (rejection non-PNG, empty
name, empty file), kemudian tulis property-based test yang memverifikasi perilaku ini tetap sama
setelah fix.

**Test Cases**:
1. **Non-PNG Rejection Preservation**: Verifikasi bahwa file non-PNG tetap ditolak dengan pesan
   "Only PNG files are accepted for frames." setelah fix
2. **Empty Name Validation Preservation**: Verifikasi bahwa form dengan nama kosong tetap
   menampilkan error "Frame name is required." setelah fix
3. **Disabled Button Preservation**: Verifikasi bahwa tombol tetap disabled ketika tidak ada file
   dipilih setelah fix
4. **Post-Success Redirect Preservation**: Verifikasi bahwa setelah upload sukses, redirect ke
   `/admin/frames/{frameId}/edit?eventId={eventId}` tetap terjadi
5. **FrameList Interaction Preservation**: Verifikasi bahwa toggle active/inactive, reorder, dan
   delete di `FrameList` tidak terpengaruh

### Unit Tests

- Test bahwa `middleware` export terdaftar dengan benar di Next.js manifest setelah rename
- Test `createSignedUploadUrl` dipanggil dengan `{ upsert: true }` di `upload-url/route.ts`
- Test bahwa `FrameUploadForm` menampilkan hint teks ketika `file` state null
- Test error message dari setiap step upload (step 1 error, step 2 error, step 3 error)
- Test bahwa JWT validation di middleware menolak request tanpa/invalid `admin_token` cookie

### Property-Based Tests

- Generate random non-PNG filenames dan verifikasi semua ditolak oleh `handleFileChange`
- Generate random form state (missing name, missing file, both) dan verifikasi disabled state
  konsisten
- Generate random upload error scenarios dan verifikasi error message selalu ditampilkan ke admin

### Integration Tests

- Test full upload flow dari `FrameUploadForm`: pilih file → isi nama → submit → verifikasi
  redirect ke edit page
- Test bahwa `/admin/frames` tidak bisa diakses tanpa valid `admin_token` cookie setelah fix
  middleware
- Test bahwa `/api/admin/frames/upload-url` mengembalikan 401 untuk request tanpa token
- Test retry upload (signed URL untuk path yang sama) berhasil setelah fix `upsert: true`
