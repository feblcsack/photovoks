/**
 * Y2K scrapbook building blocks shared by the guest passport, booth, minizine
 * and live wall: logo, tape, paper clip, rubber stamp, sticker, doodles and the
 * "PHOTOS DELIVERED HERE" machine slot. All vector/CSS — no extra downloads
 * besides the (cached, static) logo PNG.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { y2kStickerUrl } from '@/lib/y2k-stickers';

export function Logo({ className, size = 'md', alt = 'Photovoks' }: { className?: string; size?: 'sm' | 'md' | 'lg'; alt?: string }) {
  const src = size === 'sm' ? '/brand/photovoks-logo-sm.png' : '/brand/photovoks-logo.png';
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={720} height={697} className={cn('h-auto select-none', className)} draggable={false} />;
}

/** Small round logo badge (works on dark/red backgrounds too). */
export function LogoBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-[#FFFBEF] shadow-[2px_2px_0_var(--color-ink)]', className)}>
      <Logo size="sm" className="w-[86%]" alt="" />
    </span>
  );
}

export function Tape({ className, tone = 'yellow', style }: { className?: string; tone?: 'yellow' | 'pink' | 'blue'; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn('tape pointer-events-none absolute z-10 block h-6 w-24', tone === 'pink' && 'tape-pink', tone === 'blue' && 'tape-blue', className)} style={style} />;
}

export function PaperClip({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 40 110" className={cn('pointer-events-none absolute z-20 w-7 drop-shadow-[1px_2px_1px_rgba(0,0,0,0.25)]', className)} style={style}>
      <defs>
        <linearGradient id="clip-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#8B8F96" />
          <stop offset=".5" stopColor="#F2F3F5" />
          <stop offset="1" stopColor="#7E8289" />
        </linearGradient>
      </defs>
      <path d="M26 30 V84 a8 8 0 0 1 -16 0 V18 a12 12 0 0 1 24 0 V88 a16 16 0 0 1 -32 0 V36" fill="none" stroke="url(#clip-metal)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Pushpin / round magnet. */
export function Magnet({ className, color = '#C4201A', style }: { className?: string; color?: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute z-20 block size-6 rounded-full shadow-[1px_3px_3px_rgba(0,0,0,0.35)]', className)}
      style={{ background: `radial-gradient(circle at 35% 30%, #ffffffcc 0 12%, ${color} 34%, color-mix(in srgb, ${color} 70%, black) 100%)`, ...style }}
    />
  );
}

/** Rubber stamp (passport visa / "APPROVED"). */
export function Stamp({ children, className, color = '#C4201A', rotate = -10, round = false }: { children: React.ReactNode; className?: string; color?: string; rotate?: number; round?: boolean }) {
  return (
    <span
      className={cn(
        'pointer-events-none inline-flex flex-col items-center justify-center border-[3px] px-3 py-1 text-center font-type leading-tight tracking-widest uppercase opacity-80 mix-blend-multiply',
        round ? 'aspect-square rounded-full border-double border-[5px] p-2' : 'rounded-[6px]',
        className,
      )}
      style={{ color, borderColor: color, transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

export function Sticker({ id, className, style, rotate = 0 }: { id: string; className?: string; style?: React.CSSProperties; rotate?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={y2kStickerUrl(id)} alt="" aria-hidden draggable={false} className={cn('pointer-events-none select-none', className)} style={{ transform: `rotate(${rotate}deg)`, ...style }} />
  );
}

/** Hand-drawn squiggle doodles (stars, swirl, arrow). */
export function Doodle({ kind, className, style }: { kind: 'swirl' | 'stars' | 'arrow' | 'sparkles' | 'heart'; className?: string; style?: React.CSSProperties }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg aria-hidden viewBox="0 0 120 120" className={cn('pointer-events-none', className)} style={style}>
      {kind === 'swirl' ? <path {...common} d="M60 60 c0-6 8-8 10-2 c3 9-8 16-16 12 c-12-6-8-24 6-26 c18-3 28 14 22 28 c-7 18-32 20-44 8 c-16-16-6-44 18-48 c20-3 40 8 44 28" /> : null}
      {kind === 'stars' ? (
        <g {...common}>
          <path d="M30 20 l5 14 l14 2 l-11 9 l4 14 l-12-8 l-12 8 l4-14 l-11-9 l14-2z" />
          <path d="M86 58 l3 8 l8 1 l-6 5 l2 8 l-7-5 l-7 5 l2-8 l-6-5 l8-1z" />
          <path d="M44 88 l2 6 l6 1 l-5 4 l2 6 l-5-3 l-5 3 l2-6 l-5-4 l6-1z" />
        </g>
      ) : null}
      {kind === 'arrow' ? <path {...common} d="M14 90 C34 40 70 30 100 40 M86 26 l16 14 l-18 10" /> : null}
      {kind === 'sparkles' ? (
        <g {...common}>
          <path d="M40 16 v28 M26 30 h28 M30 20 l20 20 M50 20 l-20 20" />
          <path d="M88 60 v20 M78 70 h20" />
          <path d="M60 96 v12 M54 102 h12" />
        </g>
      ) : null}
      {kind === 'heart' ? <path {...common} d="M60 100 C20 74 12 50 26 34 C38 22 54 28 60 42 C66 28 82 22 94 34 C108 50 100 74 60 100Z" /> : null}
    </svg>
  );
}

/**
 * The photo machine's metal "PHOTOS DELIVERED HERE" plate + slot. The strip
 * prints *out of the slot*: children are clipped to the area below the slot
 * and slide down with the `.print-out` animation.
 */
export function PhotoMachineSlot({ children, printing, className, trayClassName, label = 'Photos delivered here', sub = 'dalam 3 detik' }: { children: React.ReactNode; printing: boolean; className?: string; trayClassName?: string; label?: string; sub?: string }) {
  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      {/* Plate */}
      <div className="relative z-20 w-[min(250px,70%)] rounded-[6px] border border-black/30 bg-[linear-gradient(160deg,#f5f6f8_0%,#b9bdc4_45%,#eef0f2_60%,#a4a8b0_100%)] px-4 py-2 text-center shadow-[0_2px_0_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.8)]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('absolute size-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff,#777)] shadow-[inset_0_0_1px_rgba(0,0,0,0.6)]', i < 2 ? 'top-1.5' : 'bottom-1.5', i % 2 ? 'right-1.5' : 'left-1.5')} />
        ))}
        <p className="font-type text-[15px] leading-tight font-bold tracking-wide text-[#1d1d1d] uppercase">{label}</p>
        <p className="font-type text-[11px] text-[#2a2a2a]">{sub} ↓</p>
      </div>
      {/* Slot mouth */}
      <div className={cn('relative z-20 -mt-0.5 h-5 w-[min(320px,92%)] rounded-[5px] border-2 border-[#4a2a17] bg-[linear-gradient(#2a160b,#5b3018)] shadow-[inset_0_4px_6px_rgba(0,0,0,0.7),0_2px_0_rgba(255,255,255,0.25)]', printing && 'machine-busy')}>
        <span className="absolute inset-x-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/80" />
      </div>
      {/* Output tray: the print slides out from under the slot (children
          carry the .print-out animation so callers can restart it). */}
      <div className={cn('relative z-10 -mt-2.5 overflow-hidden pt-2.5', trayClassName ?? 'w-[min(300px,86%)]')}>{children}</div>
    </div>
  );
}
