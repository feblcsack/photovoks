/**
 * Step-by-step folding guide for the SKCK sheet, with tiny line diagrams.
 * Colours match the on-screen guide lines: red = fold 1, blue = gunung
 * (mountain), green = lembah (valley).
 */
import React from 'react';
import { cn } from '@/lib/utils';

const RED = '#C4201A';
const BLUE = '#2747C9';
const GREEN = '#1E7A3E';

function Sheet() {
  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full">
      <rect x="4" y="4" width="112" height="72" fill="#F4F0E6" stroke="#000" strokeWidth="1.5" />
      <rect x="4" y="4" width="112" height="36" fill="#DCE3F6" />
      {[1, 2, 3].map((i) => <line key={i} x1={4 + i * 28} y1="4" x2={4 + i * 28} y2="76" stroke={i === 2 ? GREEN : BLUE} strokeWidth="1.2" strokeDasharray="3 2" />)}
      <line x1="4" y1="40" x2="116" y2="40" stroke={RED} strokeWidth="1.6" strokeDasharray="4 2" />
      <text x="60" y="24" textAnchor="middle" fontSize="8" fill="#555">belakang ↻</text>
      <text x="18" y="62" textAnchor="middle" fontSize="7" fill="#000">sampul</text>
    </svg>
  );
}

function FoldHalf() {
  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full">
      <rect x="4" y="40" width="112" height="36" fill="#F4F0E6" stroke="#000" strokeWidth="1.5" />
      <path d="M8 38 C 8 18, 112 18, 112 38" fill="none" stroke={RED} strokeWidth="1.6" />
      <path d="M106 30 l6 8 l3 -9" fill="none" stroke={RED} strokeWidth="1.6" />
      <text x="60" y="16" textAnchor="middle" fontSize="8" fill={RED}>atas → ke belakang</text>
      {[1, 2, 3].map((i) => <line key={i} x1={4 + i * 28} y1="40" x2={4 + i * 28} y2="76" stroke="#999" strokeWidth="0.8" />)}
    </svg>
  );
}

function Zigzag() {
  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full">
      <polyline points="10,58 38,30 66,58 94,30 110,46" fill="none" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="38" cy="30" r="3" fill={BLUE} />
      <circle cx="66" cy="58" r="3" fill={GREEN} />
      <circle cx="94" cy="30" r="3" fill={BLUE} />
      <text x="38" y="20" textAnchor="middle" fontSize="7.5" fill={BLUE}>gunung</text>
      <text x="66" y="72" textAnchor="middle" fontSize="7.5" fill={GREEN}>lembah</text>
      <text x="94" y="20" textAnchor="middle" fontSize="7.5" fill={BLUE}>gunung</text>
    </svg>
  );
}

function Card() {
  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full">
      {[6, 4, 2, 0].map((o, i) => <rect key={i} x={44 + o} y={10 + o} width="34" height="50" fill={i === 3 ? '#F4F0E6' : '#E6E0D2'} stroke="#000" strokeWidth="1.2" />)}
      <text x="61" y="34" textAnchor="middle" fontSize="7" fontStyle="italic" fill="#6E1A1A">Cukup</text>
      <text x="61" y="43" textAnchor="middle" fontSize="7" fontStyle="italic" fill="#6E1A1A">Kalcer</text>
    </svg>
  );
}

const STEPS: Array<{ art: React.ReactNode; title: string; body: string }> = [
  { art: <Sheet />, title: 'Cetak', body: 'Satu sisi, lanskap, skala 100% (jangan “fit to page”). Setengah atas memang tercetak terbalik.' },
  { art: <FoldHalf />, title: 'Lipat 1 · merah', body: 'Lipat dua memanjang: setengah atas dilipat ke belakang. Tekan garis lipatnya rata.' },
  { art: <Zigzag />, title: 'Lipat 2–4 · biru & hijau', body: 'Lipat akordeon: biru = gunung (garis menonjol ke arahmu), hijau = lembah (garis masuk ke dalam).' },
  { art: <Card />, title: 'Jadi kartu saku', body: 'Sampul “Cukup Kalcer” ada paling depan. Balik untuk membaca keterangan di belakang.' },
];

export function FoldSteps({ className }: { className?: string }) {
  return (
    <ol className={cn('grid gap-2 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {STEPS.map((s, i) => (
        <li key={s.title} className="win-fieldset flex flex-col gap-1.5 bg-win">
          <div className="bevel-in bg-white p-1.5">{s.art}</div>
          <p className="font-pixel text-[14px] font-bold">{i + 1}. {s.title}</p>
          <p className="font-sans text-[12.5px] leading-snug">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
