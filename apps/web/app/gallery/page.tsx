import Link from 'next/link';
import type { Metadata } from 'next';
import { Aperture, Images } from 'lucide-react';
import { publicEvents } from '@/lib/public-gallery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Galeri publik' };

export default async function GlobalGalleryPage() {
  const events = await publicEvents();
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-extrabold"><span className="flex size-8 items-center justify-center rounded-[9px] bg-ink text-white"><Aperture className="size-4" /></span> Photovoks</Link>
      </header>
      <h1 className="text-3xl font-extrabold tracking-tight">Galeri publik</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Hanya event yang penyelenggaranya memilih visibilitas <b>Publik</b>. Foto lain tetap privat.</p>
      {!events.length ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-muted"><Images className="size-7" /><p className="text-sm">Belum ada event publik.</p></div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {events.map((e) => (
            <Link key={e.galleryToken} href={`/g/${e.galleryToken}`} className="group rounded-[18px] border border-line bg-surface p-4 shadow-panel transition hover:shadow-pop">
              <div className="grid grid-cols-6 gap-1.5">
                {e.cover.map((s) => (
                  <div key={s.id} className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[6px] bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.urls.thumb ? <img src={s.urls.thumb} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : null}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-base font-bold">{e.name}</p>
              <p className="text-xs text-muted">{e.total} sesi</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
