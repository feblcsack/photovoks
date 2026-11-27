'use client';

/**
 * Headline promo for the SIM photozine ("Surat Izin Mejeng") — the main
 * gimmick. Explains in one glance what it is and how it works.
 */
import React from 'react';
import { IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WordArt } from '@/components/brand/WordArt';
import { WinWindow } from '@/components/os/retro';
import { cn } from '@/lib/utils';

/** Small static accordion mock: cover + photo panels. */
export function SimMock({ thumbs = [], className }: { thumbs?: string[]; className?: string }) {
  const panel = 'relative h-[118px] w-[84px] shrink-0 border-2 border-ink bg-[#F3F1EA] shadow-[3px_4px_0_rgba(0,0,0,0.25)]';
  return (
    <div className={cn('flex items-center justify-center [perspective:700px]', className)} aria-hidden>
      <div className={panel} style={{ transform: 'rotateY(18deg)' }}>
        <span className="absolute inset-x-0 top-2 text-center text-[9px] font-black tracking-wide">SAMSAT KALCER</span>
        <span className="absolute inset-x-0 top-6 text-center font-heavy text-[34px] leading-none">SIM</span>
        <span className="absolute inset-x-0 top-[62px] text-center font-[family-name:var(--font-typewriter)] text-[10px] leading-tight">Surat Izin<br />Mejeng</span>
        <span className="absolute inset-x-2 bottom-2 rounded-full bg-ink py-0.5 text-center text-[7px] font-black text-white">GOL. C · CEKREK</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(panel, '-ml-1 flex flex-col items-center pt-2')} style={{ transform: `rotateY(${i % 2 ? 18 : -18}deg)` }}>
          <span className="text-[10px] leading-none">★</span>
          <span className="mt-1 h-[70px] w-[64px] overflow-hidden border-2 border-ink bg-[#BDBAB2] grayscale">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[i] ? <img src={thumbs[i]} alt="" className="size-full object-cover contrast-125" /> : null}
          </span>
          <span className="mt-1 text-[8px] font-black">{['PEMEGANG SIM', 'POSE TERDAFTAR', 'BARANG BUKTI'][i]}</span>
        </div>
      ))}
    </div>
  );
}

export function SimPromo({ onOpen, thumbs, className, cta = 'Bikin SIM-ku sekarang' }: { onOpen: () => void; thumbs?: string[]; className?: string; cta?: string }) {
  return (
    <WinWindow
      title="SIM.exe — Fitur Unggulan"
      icon="star"
      className={className}
      bodyClassName="relative overflow-hidden bg-[#F3F1EA] p-4 sm:p-5 [background-image:radial-gradient(rgba(20,18,16,0.12)_1px,transparent_1px)] [background-size:6px_6px]"
    >
      <span className="absolute top-3 right-3 rotate-6 border-2 border-ink bg-sun px-2 py-0.5 font-techno text-[11px] font-black tracking-wider shadow-[2px_2px_0_var(--color-ink)]">★ BARU ★</span>
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-3">
            <WordArt variant="outline" className="text-[64px] leading-none">SIM</WordArt>
            <p className="pb-2 font-[family-name:var(--font-scribble)] text-[28px] leading-none">Surat Izin Mejeng</p>
          </div>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">
            Photozine lipat ala surat kendaraan, dari fotomu sendiri. <b>Mejeng</b> = tampil gaya di depan umum, dan sekarang kamu resmi punya izinnya ✶
          </p>
          <ul className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-3">
            <li className="border-2 border-ink bg-white px-2 py-1.5"><b className="block font-techno text-[11px]">01 · ISI</b>Nama + golongan: A Anak Kalcer, B Bikunholic, C Cekrek, D Dandan Maksimal</li>
            <li className="border-2 border-ink bg-white px-2 py-1.5"><b className="block font-techno text-[11px]">02 · CETAK</b>1 lembar A4, 1 sisi. Gaya xerox hitam-putih atau warna</li>
            <li className="border-2 border-ink bg-white px-2 py-1.5"><b className="block font-techno text-[11px]">03 · LIPAT</b>Lipat 2× jadi kartu saku 8 halaman. Tanpa gunting & lem</li>
          </ul>
          <Button variant="win-go" size="lg" className="mt-4" onClick={onOpen}><IdCard /> {cta}</Button>
        </div>
        <SimMock thumbs={thumbs} className="py-2" />
      </div>
    </WinWindow>
  );
}
