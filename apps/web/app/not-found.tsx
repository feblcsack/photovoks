import Link from 'next/link';
import { WordArt } from '@/components/brand/WordArt';
import { HillsWallpaper, PixelIcon, WinWindow } from '@/components/os/retro';

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
      <HillsWallpaper />
      <WordArt variant="chrome" className="relative text-[clamp(80px,18vw,160px)]">404</WordArt>
      <WinWindow title="Nyasar.exe" icon="warning" className="relative w-full max-w-sm text-left" bodyClassName="p-4">
        <div className="flex gap-3">
          <PixelIcon name="warning" className="size-10 shrink-0" />
          <div className="text-sm">
            <p className="font-pixel text-[15px] font-bold">Halaman tidak ditemukan.</p>
            <p className="mt-1 text-ink-2">Periksa kode event atau link yang kamu buka.</p>
            <Link href="/" className="mt-3 inline-block font-semibold text-brand">Ke beranda →</Link>
          </div>
        </div>
      </WinWindow>
    </main>
  );
}
