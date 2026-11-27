import Link from 'next/link';
import { EnterCode } from '@/components/landing/EnterCode';
import { Logo, Sticker } from '@/components/brand/scrap';
import { Bubbles, DesktopIcon, Goldfish, HillsWallpaper, PixelIcon, Taskbar, TaskItem, WinPanel, WinWindow } from '@/components/os/retro';
import { LocationCard } from '@/components/location/LocationCard';
import type { PixelIconName } from '@/lib/pixel-icons';
import { WordArt } from '@/components/brand/WordArt';

const FEATURES: Array<[PixelIconName, string, string]> = [
  ['star', 'Pilih karakter', '4 pemandu 3D yang menemani tamu dari awal sampai QR'],
  ['tv', 'Frame Builder', 'Drag & drop, slot kembar (1 foto → kiri & kanan), QR softfile di frame'],
  ['camera', 'Booth', 'iPad / laptop / HP, filter vintage, foto bergerak & GIF'],
  ['printer', 'Cetak', 'Langsung dari booth atau antrean print station'],
  ['floppy', 'Paspor foto', 'Scan QR → strip keluar dari mesin, stiker, AI, unduh'],
  ['book', 'Minizine', '8 halaman dari 1 lembar — di HP atau di booth, lengkap cara lipat'],
  ['folder', 'Live wall', 'Foto ditempel di "kulkas" event + stiker Y2K dari tamu'],
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="fixed inset-0 -z-10">
        <HillsWallpaper />
      </div>
      <Goldfish className="pointer-events-none absolute top-24 right-[6%] hidden w-28 animate-float md:block" />
      <Bubbles className="pointer-events-none absolute top-10 right-[16%] hidden w-20 animate-float [animation-delay:1s] md:block" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 pt-[max(16px,env(safe-area-inset-top))] pb-6 sm:px-6">
        <nav className="hidden shrink-0 flex-col gap-3 md:flex" aria-label="Pintasan">
          <Link href="/gallery"><DesktopIcon icon="folder" label="Galeri" /></Link>
          <Link href="/admin"><DesktopIcon icon="computer" label="Portal pemilik" /></Link>
          <a href="#lokasi"><DesktopIcon icon="pin" label="Lokasi" /></a>
          <DesktopIcon icon="recycle" label="Recycle Bin" />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="grid items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
            <WinWindow title="Photovoks 98 — Selamat datang" icon="computer" bodyClassName="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <Logo className="w-[min(130px,28vw)] -rotate-3" />
                <p className="font-display text-[clamp(30px,5vw,52px)] leading-none">
                  Photovoks<span className="ml-1 align-top font-pixel text-[0.45em] text-brand">98</span>
                </p>
              </div>
              <h1 className="mt-4 text-[clamp(32px,5vw,56px)] leading-[1]">
                Photobooth event,{' '}
                <WordArt variant="sunset" className="mx-1 align-[-0.08em]">siap cetak</WordArt> dari browser.
              </h1>
              <p className="mt-4 max-w-lg font-type text-lg text-ink-2">Masukkan kode event untuk membuka booth atau portal operator.</p>
              <fieldset className="mt-5 max-w-md border-2 border-win-shadow px-3 pt-1 pb-3 [border-style:groove]">
                <legend className="px-1 font-pixel text-[14px]">Masuk.exe</legend>
                <EnterCode />
              </fieldset>
            </WinWindow>

            <WinWindow title="Fitur.txt — Notepad" icon="book" menu={['File', 'Edit', 'Cari', 'Bantuan']} bodyClassName="p-1.5" status={<span>{FEATURES.length} fitur · Ln 1, Col 1</span>}>
              <WinPanel className="relative">
                <dl className="font-type text-[15px]">
                  {FEATURES.map(([icon, title, body]) => (
                    <div key={title} className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-dotted border-ink/20 py-2.5 last:border-b-0">
                      <dt><PixelIcon name={icon} className="size-8" /></dt>
                      <dd>
                        <span className="block font-pixel text-[15px] font-bold">{title}</span>
                        <span className="mt-0.5 block font-sans text-sm text-ink-2">{body}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <Sticker id="camera" className="absolute -right-3 -bottom-4 w-20 rotate-12" />
              </WinPanel>
            </WinWindow>
          </div>

          <section id="lokasi" className="scroll-mt-4">
            <WinWindow title="Lokasi — UI Depok" icon="pin" bodyClassName="bg-[#9ED8FF] p-3 sm:p-5 [background-image:radial-gradient(rgb(39_71_201/0.25)_1px,transparent_1px)] [background-size:10px_10px]">
              <LocationCard note="booth photovoks mangkal di kampus UI Depok ✶ datang, pilih karakter, bergaya, cetak. sampai ketemu!" />
            </WinWindow>
          </section>
        </div>
      </main>

      <Taskbar className="sticky bottom-0 z-20">
        <TaskItem icon="folder" href="/gallery">Galeri</TaskItem>
        <TaskItem icon="computer" href="/admin">Portal pemilik</TaskItem>
      </Taskbar>
    </div>
  );
}
