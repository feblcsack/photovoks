/**
 * Bahasa Indonesia strings for the Photovoks booth UI, session page, and error states.
 *
 * ALL visible text in booth components MUST be sourced from this module —
 * no hardcoded strings in components. (Req 17.4)
 */
export const id = {
  // ── Idle Screen ─────────────────────────────────────────────────────────────
  idle: {
    tapToStart: 'Ketuk untuk mulai',
    title: 'Photovoks',
    subtitle: 'Abadikan momen indahmu ✨',
  },

  // ── Consent Screen ───────────────────────────────────────────────────────────
  consent: {
    title: 'Persetujuan Penggunaan Foto',
    body: 'Fotomu akan dicetak sebagai photostrip. Jika kamu memilih membuat doodle AI, satu foto akan diproses oleh Google Gemini.',
    retentionNotice: (days: number) =>
      `Foto Anda akan dihapus otomatis setelah ${days} hari.`,
    accept: 'Saya Setuju',
    decline: 'Tidak',
  },

  // ── Frame Selection ──────────────────────────────────────────────────────────
  frames: {
    title: 'Pilih Bingkai',
    noFrames: 'Tidak ada bingkai tersedia.',
    returnToIdle: 'Kembali ke Awal',
    preview: 'Pratinjau',
    confirm: 'Pilih Bingkai Ini',
    back: 'Kembali',
    hint: 'Pilih bingkai yang kamu suka ✨',
  },

  // ── Capture Screen ───────────────────────────────────────────────────────────
  capture: {
    retake: 'Foto Ulang',
    next: 'Berikutnya',
    countdown: (n: number) => `${n}`,
    slotProgress: (current: number, total: number) => `Foto ${current} dari ${total}`,
  },

  // ── Preview Screen ───────────────────────────────────────────────────────────
  preview: {
    title: 'Pratinjau Strip',
    photosTitle: 'Foto Anda',
    stripTitle: 'Strip Foto',
    composing: 'Menyusun strip…',
    confirm: 'Cetak',
    back: 'Foto Ulang',
    sketchHint: 'Ketuk satu foto untuk dijadikan doodle AI',
    photoLabel: (n: number) => `Foto ${n}`,
    selectedForSketch: 'Untuk doodle AI',
  },

  // ── Composing / Uploading ────────────────────────────────────────────────────
  composing: {
    title: 'Menyiapkan cetakan…',
    uploading: 'Mengunggah foto…',
    processing: 'Memproses…',
  },

  // ── End Screen ───────────────────────────────────────────────────────────────
  end: {
    printing: 'Sedang mencetak…',
    printed: 'Cetak selesai!',
    done: 'Selesai',
    uploadPending: 'Unggahan masih berlangsung…',
    noRealtime: 'Status cetak tidak dapat dikonfirmasi.',
    printerOffline: 'Printer belum terhubung — petugas akan mencetak segera.',
    printFailed: 'Cetak gagal — hubungi petugas.',
    qrInstructions: 'Scan untuk unduh foto & bikin doodle AI',
    autoClose: (s: number) => `Kembali ke awal dalam ${s} detik`,
  },

  // ── Offline Indicator ────────────────────────────────────────────────────────
  offline: {
    indicator: 'Tidak ada koneksi internet',
  },

  // ── Error States ─────────────────────────────────────────────────────────────
  errors: {
    generic: 'Terjadi kesalahan.',
    returnToIdle: 'Kembali ke Awal',
    cameraPermissionDenied: 'Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.',
    noActiveFrames: 'Tidak ada bingkai aktif untuk acara ini. Hubungi petugas.',
    uploadFailedMaxRetries: 'Gagal mengunggah foto. Silakan hubungi petugas.',
    confirmFailed: 'Gagal mengkonfirmasi sesi. Silakan coba lagi.',
    contactStaff: 'Hubungi petugas',
  },

  // ── Session Page ─────────────────────────────────────────────────────────────
  session: {
    title: 'Foto Anda',
    downloadStrip: 'Unduh Strip Foto',
    sections: {
      strip: {
        title: 'Strip Foto',
      },
      livePhoto: {
        title: 'Live Photo',
        pending: 'Memproses Live Photo…',
        processing: 'Sedang membuat Live Photo…',
        done: 'Live Photo siap',
        failed: 'Live Photo tidak tersedia.',
      },
      sketch: {
        title: 'Doodle AI',
        pending: 'Menyiapkan doodle…',
        processing: 'AI sedang menggambar doodle-mu… (±20 detik)',
        done: 'Unduh Doodle',
        failed: 'Doodle gagal dibuat.',
        failedSafety: 'Foto ini tidak bisa diproses AI. Coba foto lain di booth ya!',
        dailyCap: 'Kuota doodle AI hari ini sudah habis.',
        retry: 'Coba Lagi',
        disabled: 'Fitur doodle AI sedang tidak aktif.',
        generate: 'Buat Doodle AI ✨',
        generateHint: 'Ubah fotomu jadi gambar doodle lucu dengan AI',
      },
    },
    printRequest: {
      button: 'Cetak Doodle',
      stationOffline: 'Printer tidak tersedia saat ini',
      queued: 'Antri untuk dicetak…',
      printing: 'Sedang mencetak doodle…',
      printed: 'Doodle berhasil dicetak! Ambil di booth 🎉',
      failed: 'Cetak doodle gagal. Hubungi petugas.',
    },
    notFound: {
      title: 'Halaman tidak ditemukan',
      body: 'Sesi ini tidak dapat ditemukan atau telah kadaluarsa.',
    },
  },
} as const;

export type I18n = typeof id;
