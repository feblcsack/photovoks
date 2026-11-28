'use client';

/**
 * Headline promo for the SKCK photozine ("Surat Keterangan Cukup Kalcer") —
 * the main gimmick. Explains in one glance what it is and how it works.
 */
import React from 'react';
import { IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WinWindow } from '@/components/os/retro';
import { cn } from '@/lib/utils';

const GOTHIC = 'font-[family-name:var(--font-gothic)]';
const EDITORIAL = 'font-[family-name:var(--font-editorial)]';

/** Small static accordion mock: cover + photo panels. */
export function SkckMock({ thumbs = [], className }: { thumbs?: string[]; className?: string }) {
  const panel = 'relative h-[118px] w-[84px] shrink-0 bg-[#F4F0E6] shadow-[3px_4px_0_rgba(0,0,0,0.3)] outline outline-1 outline-[#6E1A1A] -outline-offset-4';
  return (
    <div className={cn('flex items-center justify-center [perspective:700px]', className)} aria-hidden>
      <div className={cn(panel, 'flex flex-col items-center pt-3 text-center')} style={{ transform: 'rotateY(18deg)' }}>
        <span className={cn(EDITORIAL, 'text-[8px] text-[#5E5850] italic')}>biro urusan kalcer</span>
        <span className={cn(GOTHIC, 'mt-2 text-[10px] font-semibold')}>surat keterangan</span>
        <span className="mt-0.5 font-[family-name:var(--font-pixelgothic)] text-[26px] leading-[0.9] text-[#6E1A1A]">Cukup<br />Kalcer</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(panel, '-ml-1 flex flex-col items-center pt-2.5')} style={{ transform: `rotateY(${i % 2 ? 18 : -18}deg)` }}>
          <span className={cn(GOTHIC, 'text-[9px] font-semibold')}>{['pas foto', 'pose terdaftar', 'barang bukti'][i]}</span>
          <span className="mt-1 h-[72px] w-[62px] overflow-hidden border border-black bg-[#E6E0D2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[i] ? <img src={thumbs[i]} alt="" className="size-full object-cover" /> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkckPromo({ onOpen, thumbs, className, cta = 'Bikin SKCK-ku sekarang' }: { onOpen: () => void; thumbs?: string[]; className?: string; cta?: string }) {
  return (
    <WinWindow title="SKCK.exe — fitur unggulan" icon="book" className={className} bodyClassName="relative overflow-hidden bg-[#F4F0E6] p-4 sm:p-5">
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className={cn(EDITORIAL, 'text-[15px] text-[#5E5850] italic')}>surat keterangan</p>
          <p className="font-[family-name:var(--font-pixelgothic)] text-[52px] leading-[0.95] text-[#6E1A1A]">Cukup Kalcer</p>
          <p className={cn(EDITORIAL, 'mt-2 max-w-xl text-[17px] leading-snug text-[#2B2620]')}>
            Photozine lipat dari fotomu sendiri — pas foto, sidik kalcer, stempel “lulus”, dan QR ke foto digital. Satu lembar, dilipat jadi kartu saku 8 halaman.
          </p>
          <ol className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-3">
            {[
              ['isi', 'Nama + kategori: anak baru kalcer, bikunholic, cekrek profesional, dandan maksimal'],
              ['cetak', 'Satu lembar A4, satu sisi. Warna atau fotokopi hitam-putih'],
              ['lipat', 'Ikuti panduan garis lipat di layar. Tanpa gunting & lem'],
            ].map(([k, v], i) => (
              <li key={k} className="bevel-in bg-white px-2 py-1.5">
                <b className={cn(GOTHIC, 'block text-[15px]')}>{i + 1}. {k}</b>
                {v}
              </li>
            ))}
          </ol>
          <Button variant="win-go" size="lg" className="mt-4" onClick={onOpen}><IdCard /> {cta}</Button>
        </div>
        <SkckMock thumbs={thumbs} className="py-2" />
      </div>
    </WinWindow>
  );
}
