# Bugfix Requirements Document

## Introduction

Admin tidak bisa mengupload frame di halaman `/admin/frames`. Tombol "Upload Frame" dalam keadaan disabled dan tidak bisa diklik, sehingga file PNG tidak bisa diunggah ke storage. Bug ini memblokir seluruh alur pengelolaan frame untuk event, termasuk konfigurasi slot geometry yang bergantung pada upload berhasil.

Berdasarkan analisis kode, terdapat beberapa kondisi yang menyebabkan upload gagal atau tombol tidak berfungsi:
1. Tombol disabled jika tidak ada file yang dipilih (`!file`) — namun masalah yang lebih mendasar adalah ketika file sudah dipilih pun upload bisa gagal diam-diam
2. `createSignedUploadUrl` dipanggil dengan `{ upsert: false }`, sehingga akan error jika storage path sudah ada (frameId collision atau retry setelah partial failure)
3. Tidak ada middleware autentikasi aktif padahal API route diproteksi oleh komentar "Protected by admin JWT middleware", sehingga kemungkinan request unauthorized

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN admin memilih file PNG dan mengklik tombol "Upload Frame" THEN tombol tidak merespons dan tidak ada proses upload yang dimulai

1.2 WHEN admin melakukan POST ke `/api/admin/frames/upload-url` dengan `frameId` yang storage path-nya sudah ada di Supabase Storage THEN sistem mengembalikan error 500 karena `createSignedUploadUrl` dengan `{ upsert: false }` menolak path yang sudah ada

1.3 WHEN admin mengakses halaman `/admin/frames` dan mencoba upload tanpa session admin yang valid THEN sistem gagal mengautentikasi request ke API route karena middleware autentikasi tidak aktif, sehingga request diblokir atau menghasilkan error tak tertangani

1.4 WHEN upload ke Supabase Storage via signed URL mengembalikan HTTP error THEN sistem tidak menampilkan pesan error yang informatif kepada admin

### Expected Behavior (Correct)

2.1 WHEN admin memilih file PNG yang valid dan mengklik tombol "Upload Frame" THEN sistem SHALL memulai proses upload secara berurutan: mendapatkan signed URL, mengunggah file, lalu membuat DB record

2.2 WHEN admin melakukan POST ke `/api/admin/frames/upload-url` dengan `frameId` yang storage path-nya sudah ada THEN sistem SHALL berhasil membuat signed upload URL karena upsert diizinkan (atau menggunakan path baru yang unik)

2.3 WHEN request ke API route admin tidak memiliki sesi admin yang valid THEN sistem SHALL mengembalikan HTTP 401 dengan pesan error yang jelas, dan form SHALL menampilkan pesan tersebut kepada admin

2.4 WHEN upload ke Supabase Storage via signed URL gagal dengan HTTP error THEN sistem SHALL menampilkan pesan error yang informatif mencantumkan status kode dan detail kegagalan kepada admin

### Unchanged Behavior (Regression Prevention)

3.1 WHEN admin memilih file yang bukan PNG (ekstensi bukan `.png`) THEN sistem SHALL CONTINUE TO menampilkan pesan error "Only PNG files are accepted for frames." dan tidak memproses file tersebut

3.2 WHEN admin mengirimkan form tanpa memilih file THEN sistem SHALL CONTINUE TO menampilkan tombol dalam keadaan disabled dan mencegah submission

3.3 WHEN admin mengirimkan form tanpa mengisi nama frame THEN sistem SHALL CONTINUE TO menampilkan error validasi "Frame name is required." dan tidak memproses upload

3.4 WHEN upload frame berhasil sepenuhnya THEN sistem SHALL CONTINUE TO meredirect admin ke halaman `/admin/frames/{frameId}/edit?eventId={eventId}` untuk konfigurasi slot geometry

3.5 WHEN upload frame berhasil THEN sistem SHALL CONTINUE TO menyimpan record frame di database dengan `is_active: true` dan `sort_order` sebagai increment dari frame terakhir pada event yang sama
