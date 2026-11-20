import Link from 'next/link';
import { Aperture, Film, Frame, Images, Printer, Sparkles } from 'lucide-react';
import { EnterCode } from '@/components/landing/EnterCode';

const FEATURES = [
  { icon: Frame, title: 'Frame Builder visual', body: 'Drag, resize, teks & gambar — hasil di layar = hasil cetak.' },
  { icon: Film, title: 'Live photo & GIF', body: 'Setiap jepretan merekam burst singkat jadi foto bergerak.' },
  { icon: Sparkles, title: 'Gaya AI', body: 'Ubah foto jadi doodle, anime, cat air — lewat OpenRouter.' },
  { icon: Printer, title: 'Print station', body: 'Antrean cetak terpisah untuk iPad + printer foto.' },
  { icon: Images, title: 'Galeri event', body: 'Semua sesi per event dengan kontrol privasi.' },
];

export default function Home() {
  return (
    <main className="booth-paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(20px,env(safe-area-inset-top))] sm:px-8">
        <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-white"><Aperture className="size-5" /></span>Photovoks</span>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/gallery" className="rounded-ctl px-3 py-2 text-ink-2 hover:bg-ink/5">Galeri</Link>
          <Link href="/admin" className="rounded-ctl bg-ink px-3.5 py-2 text-white hover:bg-[#232B40]">Portal pemilik</Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <h1 className="text-[clamp(40px,6.5vw,76px)] leading-[0.98] font-extrabold tracking-tight">
            Photobooth event,<br />
            <span className="rounded-[12px] bg-sun px-2">siap cetak</span> dari browser.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-2">Buka booth di iPad atau laptop, pilih frame, foto, cetak, lalu tamu scan QR untuk softfile, GIF, dan versi AI.</p>
          <div className="mt-8 max-w-md">
            <EnterCode />
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-[18px] bg-white/80 p-4 shadow-[0_1px_0_rgba(14,20,36,0.06)] backdrop-blur">
              <f.icon className="size-5 text-brand" />
              <p className="mt-2 text-[15px] font-bold">{f.title}</p>
              <p className="mt-0.5 text-sm text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
