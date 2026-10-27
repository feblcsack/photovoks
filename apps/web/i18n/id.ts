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
    body: 'Foto Anda mungkin diproses oleh AI pihak ketiga untuk membuat sketsa artistik.',
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
    sketchHint: 'Ketuk foto untuk memilih sketsa AI',
    photoLabel: (n: number) => `Foto ${n}`,
    selectedForSketch: 'Untuk sketsa AI',
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
    qrInstructions: 'Scan kode QR untuk melihat foto Anda',
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
        title: 'Sketsa AI',
        pending: 'AI sedang membuat sketsa…',
        processing: 'Sedang memproses sketsa…',
        done: 'Sketsa siap',
        failed: 'Sketsa tidak tersedia.',
        generate: 'Buat Sketsa AI',
        generateHint: 'Buat sketsa artistik dari foto stripmu',
      },
    },
    printRequest: {
      button: 'Cetak Sketsa',
      stationOffline: 'Printer tidak tersedia saat ini',
      queued: 'Antri untuk dicetak…',
      printing: 'Sedang mencetak sketsa…',
      printed: 'Sketsa berhasil dicetak!',
      failed: 'Cetak sketsa gagal.',
    },
    notFound: {
      title: 'Halaman tidak ditemukan',
      body: 'Sesi ini tidak dapat ditemukan atau telah kadaluarsa.',
    },
  },
} as const;

export type I18n = typeof id;
