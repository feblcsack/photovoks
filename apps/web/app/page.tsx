import Link from 'next/link';
import { EnterCode } from '@/components/landing/EnterCode';
import { Doodle, Logo, PaperClip, Stamp, Sticker, Tape } from '@/components/brand/scrap';

const FEATURES: Array<[string, string]> = [
  ['Frame Builder', 'Drag & drop, slot kembar (1 foto → kiri & kanan), QR softfile di frame'],
  ['Booth', 'iPad / laptop, filter vintage, foto bergerak & GIF'],
  ['Cetak', 'Langsung dari booth atau antrean print station'],
  ['Paspor foto', 'Scan QR → strip keluar dari mesin, stiker, AI, unduh'],
  ['Minizine', '8 halaman dari 1 lembar — di HP atau di booth, lengkap cara lipat'],
  ['Live wall', 'Foto ditempel di "kulkas" event + stiker Y2K dari tamu'],
];

export default function Home() {
  return (
    <main className="booth-paper relative flex min-h-dvh flex-col overflow-hidden">
      <Sticker id="sparkle" className="pointer-events-none absolute top-24 right-[8%] w-20 animate-float" />
      <Sticker id="cherry" className="pointer-events-none absolute bottom-10 left-[4%] hidden w-24 animate-float [animation-delay:1s] sm:block" />
      <Doodle kind="swirl" className="pointer-events-none absolute top-[40%] left-[46%] hidden w-28 text-cobalt/40 lg:block" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
        <Logo size="sm" className="w-20 -rotate-3 lg:invisible" />
        <nav className="flex items-center gap-2 text-sm font-bold">
          <Link href="/gallery" className="rounded-full px-3 py-2 text-ink-2 hover:bg-ink/5">Galeri</Link>
          <Link href="/admin" className="rounded-full border-2 border-ink bg-ink px-4 py-2 text-white shadow-[2px_2px_0_var(--color-brand)]">Portal pemilik</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Logo className="mb-4 w-[min(340px,70vw)] -rotate-2" />
          <h1 className="text-[clamp(38px,6vw,68px)] leading-[1]">
            Photobooth event,{' '}
            <span className="inline-block -rotate-2 rounded-[14px] border-2 border-ink bg-sun px-3 shadow-[3px_3px_0_var(--color-ink)]">siap cetak</span> dari browser.
          </h1>
          <p className="mt-5 max-w-lg font-type text-lg text-ink-2">Masukkan kode event untuk membuka booth atau portal operator.</p>
          <div className="mt-8 max-w-md">
            <EnterCode />
          </div>
        </div>
        <div className="paper-card relative rotate-[1.2deg] rounded-[4px] px-6 pt-8 pb-6">
          <PaperClip className="-top-5 left-10 rotate-6" />
          <Tape className="-top-3 -right-6 rotate-[28deg]" tone="pink" />
          <p className="border-b border-ink/20 pb-2 text-center font-type text-[11px] tracking-[0.25em] text-ink-2 uppercase">Click · Flash · Print · Repeat</p>
          <dl className="font-type text-[15px]">
            {FEATURES.map(([title, body], i) => (
              <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-dotted border-ink/20 py-3 last:border-b-0">
                <dt className="text-brand">{String(i + 1).padStart(2, '0')}</dt>
                <dd>
                  <span className="block font-bold tracking-wide uppercase">{title}</span>
                  <span className="mt-0.5 block font-sans text-sm text-muted">{body}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-between">
            <Stamp round rotate={-14} className="size-20 text-[10px]"><span>✶ est.</span><span className="font-bold">2026</span><span>photovoks</span></Stamp>
            <Sticker id="camera" className="w-20 rotate-12" />
          </div>
        </div>
      </section>
    </main>
  );
}
