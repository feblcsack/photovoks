import Link from 'next/link';
import { Aperture } from 'lucide-react';
import { EnterCode } from '@/components/landing/EnterCode';

const FEATURES: Array<[string, string]> = [
  ['Frame Builder', 'Drag & drop, QR softfile di frame, hasil layar = hasil cetak'],
  ['Booth', 'iPad / laptop, layar awal pakai video sendiri, foto bergerak & GIF'],
  ['Cetak', 'Langsung dari booth atau antrean print station'],
  ['Tamu', 'Scan QR → unduh, hias dengan stiker, ubah gaya dengan AI'],
  ['Galeri live', 'Foto baru tampil di layar event dalam hitungan detik'],
  ['Buku tamu', 'Pesan, kesan, dan foto dari tamu dalam satu halaman'],
];

export default function Home() {
  return (
    <main className="booth-paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(20px,env(safe-area-inset-top))] sm:px-8">
        <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-white"><Aperture className="size-5" /></span>
          Photovoks
        </span>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/gallery" className="rounded-ctl px-3 py-2 text-ink-2 hover:bg-ink/5">Galeri</Link>
          <Link href="/admin" className="rounded-ctl bg-ink px-3.5 py-2 text-white hover:bg-ink-2">Portal pemilik</Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="text-[clamp(40px,6.5vw,76px)] leading-[0.98] font-extrabold tracking-tight">
            Photobooth event,<br />
            <span className="rounded-[12px] bg-sun px-2">siap cetak</span> dari browser.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-2">Masukkan kode event untuk membuka booth atau portal operator.</p>
          <div className="mt-8 max-w-md">
            <EnterCode />
          </div>
        </div>
        <dl className="border-y-2 border-dashed border-ink/20 font-mono text-[15px]">
          {FEATURES.map(([title, body], i) => (
            <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-dotted border-ink/15 py-3.5 last:border-b-0">
              <dt className="text-ink/35">{String(i + 1).padStart(2, '0')}</dt>
              <dd>
                <span className="block font-bold tracking-wide uppercase">{title}</span>
                <span className="mt-0.5 block font-sans text-sm text-muted">{body}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
