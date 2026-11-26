'use client';

/**
 * Step-by-step folding guide for the one-sheet 8-page mini zine, with small
 * vector illustrations (no images to download).
 */
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZINE_PAPERS, pageSizeMm } from '@/lib/zine/layout';

const INK = '#1A1410';
const RED = '#C4201A';
const BLUE = '#2747C9';

function Sheet({ children, w = 200, h = 140 }: { children?: React.ReactNode; w?: number; h?: number }) {
  return (
    <svg viewBox={`0 0 ${w + 20} ${h + 20}`} className="h-auto w-full max-w-[280px]">
      <rect x="10" y="10" width={w} height={h} rx="3" fill="#FFFCF4" stroke={INK} strokeWidth="2.5" />
      {children}
    </svg>
  );
}

const Arrow = ({ d }: { d: string }) => <path d={d} fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#ah)" />;
const Defs = () => (
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10z" fill={BLUE} />
    </marker>
  </defs>
);

const STEPS: Array<{ title: string; body: string; art: React.ReactNode }> = [
  {
    title: 'Cetak lembarnya',
    body: 'Cetak lembar zine (PDF/JPG) di satu sisi kertas, orientasi lanskap, skala 100% / "ukuran sebenarnya". Baris atas memang terbalik — itu disengaja.',
    art: (
      <Sheet>
        {[1, 2, 3].map((i) => <line key={i} x1={10 + i * 50} y1="10" x2={10 + i * 50} y2="150" stroke="#CDBE9E" strokeDasharray="4 4" />)}
        <line x1="10" y1="80" x2="210" y2="80" stroke="#CDBE9E" strokeDasharray="4 4" />
        {['6', '5', '4', '3'].map((t, i) => <text key={t} x={35 + i * 50} y="52" textAnchor="middle" fontSize="18" fontWeight="800" fill={INK} transform={`rotate(180 ${35 + i * 50} 46)`}>{t}</text>)}
        {['B', 'D', '1', '2'].map((t, i) => <text key={t} x={35 + i * 50} y="122" textAnchor="middle" fontSize="18" fontWeight="800" fill={i === 1 ? RED : INK}>{t}</text>)}
      </Sheet>
    ),
  },
  {
    title: 'Lipat jadi 8 kotak',
    body: 'Lipat memanjang (atas ke bawah), buka. Lipat melebar (kiri ke kanan), buka. Lalu lipat kedua sisi pendek ke garis tengah, buka lagi. Sekarang ada 8 kotak.',
    art: (
      <Sheet>
        <Defs />
        {[1, 2, 3].map((i) => <line key={i} x1={10 + i * 50} y1="10" x2={10 + i * 50} y2="150" stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" />)}
        <line x1="10" y1="80" x2="210" y2="80" stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" />
        <Arrow d="M110 22 C 130 40, 130 60, 112 70" />
        <Arrow d="M24 50 C 40 30, 60 30, 70 46" />
        <Arrow d="M196 50 C 180 30, 160 30, 150 46" />
      </Sheet>
    ),
  },
  {
    title: 'Gunting bagian tengah',
    body: 'Lipat melebar lagi (kiri ke kanan) sehingga lipatan ada di tengah. Dari sisi lipatan, gunting sepanjang garis tengah sampai batas 1 kotak — ikuti garis merah ✂.',
    art: (
      <Sheet w={100}>
        <line x1="10" y1="80" x2="60" y2="80" stroke={RED} strokeWidth="4" />
        <line x1="60" y1="10" x2="60" y2="150" stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="10" y1="10" x2="10" y2="150" stroke={INK} strokeWidth="5" />
        <text x="30" y="72" fontSize="20" fill={RED}>✂</text>
        <text x="16" y="146" fontSize="10" fill={INK} fontWeight="700">lipatan</text>
      </Sheet>
    ),
  },
  {
    title: 'Buka & lipat memanjang',
    body: 'Buka kertasnya, lalu lipat memanjang (atas ke bawah) dengan sisi bercetak di luar. Lubang guntingan ada di tepi lipatan atas.',
    art: (
      <Sheet h={70}>
        <line x1="60" y1="10" x2="160" y2="10" stroke={RED} strokeWidth="5" />
        {[1, 2, 3].map((i) => <line key={i} x1={10 + i * 50} y1="10" x2={10 + i * 50} y2="80" stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" />)}
        {['B', 'D', '1', '2'].map((t, i) => <text key={t} x={35 + i * 50} y="54" textAnchor="middle" fontSize="18" fontWeight="800" fill={i === 1 ? RED : INK}>{t}</text>)}
      </Sheet>
    ),
  },
  {
    title: 'Dorong ujungnya ke tengah',
    body: 'Pegang kedua ujung, dorong pelan ke arah tengah. Lubang di tengah akan terbuka membentuk tanda plus (+).',
    art: (
      <svg viewBox="0 0 220 160" className="h-auto w-full max-w-[280px]">
        <Defs />
        <path d="M110 80 L40 80 M110 80 L180 80 M110 80 L110 20 M110 80 L110 140" stroke={INK} strokeWidth="10" strokeLinecap="round" />
        <path d="M110 80 L40 80 M110 80 L180 80 M110 80 L110 20 M110 80 L110 140" stroke="#FFFCF4" strokeWidth="5" strokeLinecap="round" />
        <Arrow d="M14 100 L 40 100" />
        <Arrow d="M206 100 L 180 100" />
      </svg>
    ),
  },
  {
    title: 'Ratakan jadi buku',
    body: 'Lipat semua sayap ke satu arah hingga menjadi buku kecil dengan sampul depan di atas dan sampul belakang di bawah. Tekan lipatannya — zine kamu jadi! ✶',
    art: (
      <svg viewBox="0 0 220 160" className="h-auto w-full max-w-[280px]">
        <rect x="70" y="18" width="84" height="124" rx="3" fill="#F4EDDC" stroke={INK} strokeWidth="2.5" transform="rotate(4 112 80)" />
        <rect x="66" y="18" width="84" height="124" rx="3" fill={RED} stroke={INK} strokeWidth="2.5" />
        <text x="108" y="70" textAnchor="middle" fontSize="16" fontWeight="900" fill="#FFFCF4">my lil</text>
        <text x="108" y="92" textAnchor="middle" fontSize="16" fontWeight="900" fill="#FFFCF4">zine</text>
        <path d="M66 18 v124" stroke={INK} strokeWidth="5" />
      </svg>
    ),
  },
];

export function FoldGuide({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="rounded-[18px] border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-brand px-2.5 py-0.5 font-type text-xs text-white">Langkah {i + 1}/{STEPS.length}</span>
          <div className="flex gap-1">
            {STEPS.map((_, k) => (
              <button key={k} type="button" aria-label={`Langkah ${k + 1}`} onClick={() => setI(k)} className={cn('size-2.5 rounded-full border border-ink', k === i ? 'bg-ink' : 'bg-transparent')} />
            ))}
          </div>
        </div>
        <div className="flex min-h-[150px] items-center justify-center">{step.art}</div>
        <h3 className="mt-2 font-display text-xl">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
        <div className="mt-4 flex justify-between gap-2">
          <Button size="sm" variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft /> Sebelumnya</Button>
          <Button size="sm" variant="primary" disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}>Berikutnya <ArrowRight /></Button>
        </div>
      </div>
      {!compact ? (
        <div className="rounded-[18px] border-2 border-dashed border-ink/30 p-4">
          <p className="mb-2 font-type text-sm font-bold tracking-wide uppercase">Ukuran kertas &amp; hasil jadi</p>
          <table className="w-full font-type text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">Kertas</th>
                <th className="py-1 font-normal">Lembar (mm)</th>
                <th className="py-1 font-normal">Tiap halaman</th>
              </tr>
            </thead>
            <tbody>
              {ZINE_PAPERS.map((p) => {
                const s = pageSizeMm(p);
                return (
                  <tr key={p.id} className="border-t border-dotted border-ink/20">
                    <td className="py-1.5 font-bold">{p.label}</td>
                    <td className="py-1.5">{Math.round(p.widthMm)}×{Math.round(p.heightMm)}</td>
                    <td className="py-1.5">{s.w.toFixed(0)}×{s.h.toFixed(0)} mm</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Tips: pakai kertas 80–120 gsm agar lipatan rapi. Cetak tanpa &quot;fit to page&quot; supaya garis lipat pas.</p>
        </div>
      ) : null}
    </div>
  );
}
