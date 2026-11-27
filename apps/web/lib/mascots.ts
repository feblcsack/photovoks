/**
 * The four Photovoks buddies — original characters (no real people) that
 * borrow a meme *mood* each: broke, shocked, sleepy, sly. The guest picks one
 * on the "Pilih karakter" screen and it guides them through the booth and the
 * QR page with its own voice.
 */

export const MASCOT_IDS = ['bokek', 'kaget', 'ngantuk', 'licik'] as const;
export type MascotId = (typeof MASCOT_IDS)[number];

/** Moments the guide talks about. */
export type GuideMoment =
  | 'hello'
  | 'frames'
  | 'ready'
  | 'countdown'
  | 'saved'
  | 'review'
  | 'processing'
  | 'done'
  | 'error'
  | 'guest'
  | 'guest-tools'
  | 'zine'
  | 'idle';

export interface MascotInfo {
  id: MascotId;
  name: string;
  /** Short "class" label shown under the name. */
  kind: string;
  tagline: string;
  /** Accent used for the select ring, stat bars and speech balloon. */
  color: string;
  stats: Array<[string, number]>;
  lines: Record<GuideMoment, string[]>;
}

export const MASCOTS: Record<MascotId, MascotInfo> = {
  bokek: {
    id: 'bokek',
    name: 'Si Bokek',
    kind: 'Tipe Hemat',
    tagline: 'Dompet kosong, gaya tetap mahal.',
    color: '#2747C9',
    stats: [['Gaya', 7], ['Pose', 5], ['Hemat', 10], ['Ceria', 3]],
    lines: {
      hello: ['Halo. Fotonya gratis kan? …kan?', 'Aku nemenin ya. Bayarnya pakai senyum aja.'],
      frames: ['Pilih frame yang paling mewah. Toh gratis.', 'Geser atas-bawah, ketuk yang kamu suka.'],
      ready: ['Atur posisi dulu, tombol kuning kalau siap.', 'Pose mahal, modal nol. Yuk.'],
      countdown: ['Tahan… senyum orang punya duit!', 'Jangan kedip, nanti rugi.'],
      saved: ['Tersimpan. Satu aset berharga.', 'Mantap, nilai investasi naik.'],
      review: ['Pilih filter, atau ulangi foto yang kurang.', 'Kalau sudah oke, tekan Lanjut.'],
      processing: ['Lagi disusun… sabar, ini gratis.', 'Mengunggah tanpa biaya tambahan.'],
      done: ['Scan QR-nya biar fotonya ada di HP kamu.', 'Ambil cetakannya di bawah slot ya.'],
      error: ['Internetnya bokek juga kayaknya. Coba lagi.'],
      guest: ['Ini paspor fotomu. Unduh sebelum kedaluwarsa!', 'Semua di sini gratis. Unduh sepuasnya.'],
      'guest-tools': ['Mau ditempel stiker? Gratis juga lho.', 'Bikin minizine: 8 halaman, 1 kertas. Hemat!'],
      zine: ['Satu lembar kertas jadi buku. Hemat banget.'],
      idle: ['Masih di sana? Ketuk aku kalau butuh bantuan.'],
    },
  },
  kaget: {
    id: 'kaget',
    name: 'Mas Rusdi',
    kind: 'Tipe Reaksi',
    tagline: 'Semua hal itu mengejutkan.',
    color: '#C4201A',
    stats: [['Gaya', 6], ['Ekspresi', 10], ['Reaksi', 10], ['Kalem', 1]],
    lines: {
      hello: ['HAH?! Kamu milih aku?! YES!!', 'WOI! Siap foto?!'],
      frames: ['FRAMENYA BANYAK BANGET?!', 'Geser, ketuk, gas!!'],
      ready: ['Kamera nyala?! Wajahmu kelihatan!!', 'Tekan tombol kuning kalau udah siap!!'],
      countdown: ['3… 2… AAAA!', 'SEBENTAR LAGI!!'],
      saved: ['KEREN BANGET?!', 'ITU KAMU?! Cakep!'],
      review: ['Pilih filter! Ulangi kalau kurang!', 'LANJUT kalau udah puas!!'],
      processing: ['Lagi diproses?! Cepet banget!', 'Sabar… AKU GAK SABAR!'],
      done: ['SCAN QR-NYA! Fotonya pindah ke HP!', 'Cetakannya keluar dari slot!!'],
      error: ['WADUH?! Ada error! Coba lagi!'],
      guest: ['FOTOMU KELUAR DARI MESIN?!', 'Unduh, tempel stiker, bikin zine!!'],
      'guest-tools': ['Stiker Y2K?! Wajib!', 'Tempel ke live wall biar dilihat semua!!'],
      zine: ['Kertas dilipat jadi BUKU?!'],
      idle: ['Halo?! Masih di sana?!'],
    },
  },
  ngantuk: {
    id: 'ngantuk',
    name: 'Titut',
    kind: 'Tipe Rajin',
    tagline: 'Rajin nyatet, walau sambil merem.',
    color: '#3F7360',
    stats: [['Gaya', 6], ['Rajin', 9], ['Melek', 2], ['Kalem', 10]],
    lines: {
      hello: ['Hoaam… hai. Aku catat semua langkahnya ya.', 'Zzz… eh, iya, aku di sini.'],
      frames: ['Catatan 1: pilih frame. Geser, lalu ketuk.', 'Pelan-pelan aja milihnya…'],
      ready: ['Catatan 2: lihat kamera. Tombol kuning kalau siap.', 'Aku… merem dulu sebentar…'],
      countdown: ['Hitungan… zzz… eh senyum!', 'Melek, melek!'],
      saved: ['Dicatat: foto bagus.', 'Tersimpan rapi.'],
      review: ['Catatan 3: pilih filter, lalu Lanjut.', 'Mau ulang? Ketuk ikon ↺.'],
      processing: ['Sambil nunggu, aku tidur sebentar…', 'Menyusun… zzz…'],
      done: ['Catatan 4: scan QR. Selesai.', 'Cetakan ada di slot bawah.'],
      error: ['Hmm… ada yang macet. Coba lagi pelan-pelan.'],
      guest: ['Ini halaman fotomu. Semua tersimpan di sini.', 'Jangan lupa unduh sebelum tanggal habis.'],
      'guest-tools': ['Bisa bikin minizine juga. Ada panduan lipatnya.', 'Lokasi event ada di peta bawah.'],
      zine: ['Lipat ikuti garis. Aku sudah catat caranya.'],
      idle: ['Zzz… ketuk aku kalau perlu.'],
    },
  },
  licik: {
    id: 'licik',
    name: 'Teddy??',
    kind: 'Tipe Akal',
    tagline: 'Selalu punya trik rahasia.',
    color: '#B45309',
    stats: [['Gaya', 9], ['Akal', 10], ['Pose', 8], ['Jujur', 3]],
    lines: {
      hello: ['Psst… pilihan cerdas. Aku tahu semua triknya.', 'Hehe. Ikutin aku, dijamin kece.'],
      frames: ['Trik: frame banyak slot = lebih banyak gaya.', 'Yang ini bagus… atau itu? Hehe.'],
      ready: ['Trik: dagu sedikit turun, mata ke lensa.', 'Tekan tombol kuning kalau siap.'],
      countdown: ['Sekarang! Senyum licik!', 'Miringin kepala dikit… pas!'],
      saved: ['Hehe, pose rahasia berhasil.', 'Satu lagi untuk koleksi.'],
      review: ['Trik: coba filter Booth Noir. Misterius.', 'Ulangi yang kurang, lalu Lanjut.'],
      processing: ['Sedang dirakit diam-diam…', 'Jangan bilang siapa-siapa, ini cepat.'],
      done: ['Scan QR, fotonya pindah ke HP. Rahasia kita.', 'Cetakan ada di slot. Ambil, hehe.'],
      error: ['Hmm, ada yang menghalangi. Coba sekali lagi.'],
      guest: ['Psst… semua fotomu ada di sini.', 'Trik: tempel stiker sebelum diunduh.'],
      'guest-tools': ['Tempel ke live wall, biar semua lihat.', 'Bikin minizine, bagi ke teman. Hehe.'],
      zine: ['Satu potongan di tengah — itu triknya.'],
      idle: ['Hehe, masih di sini? Ketuk aku.'],
    },
  },
};

export function isMascotId(v: unknown): v is MascotId {
  return typeof v === 'string' && (MASCOT_IDS as readonly string[]).includes(v);
}

export function randomMascot(exclude?: MascotId): MascotId {
  const pool = MASCOT_IDS.filter((m) => m !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** A line for this moment; `n` rotates through the alternatives. */
export function mascotLine(id: MascotId, moment: GuideMoment, n = 0): string {
  const list = MASCOTS[id].lines[moment];
  return list[((n % list.length) + list.length) % list.length];
}

/** Local storage key for the guest's chosen buddy on their phone. */
export const BUDDY_STORAGE_KEY = 'pv-buddy';
